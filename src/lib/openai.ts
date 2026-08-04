import { IMAGE_DIMENSIONS, type GeneratedImage, type ImageSize, type ReferenceImage } from "@/lib/ai-types";

const OPENAI_API_URL = "https://api.openai.com/v1";

/**
 * Geração de imagem na OpenAI.
 *
 * É o único provedor do app que desenha texto legível dentro da imagem — por
 * isso, quando ele está ativo, a copy vai no prompt em vez de ser composta em
 * vetor por cima (ver `creative.ts`, que continua servindo à Cloudflare).
 *
 * Também é o único que faz edição com imagens de referência de verdade: o
 * endpoint `/images/edits` aceita até 16 imagens de entrada.
 *
 * Diferente do Gemini e da Cloudflare, aqui NÃO existe tier gratuito — cada
 * criativo é cobrado (na ordem de US$ 0,02 a US$ 0,20, conforme `quality`).
 */
const MODELS = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"];

const ATTEMPT_TIMEOUT_MS = 120_000;

export function openaiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function openaiImageModel() {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || MODELS[0];
}

/** low | medium | high — controla custo e nitidez do texto renderizado. */
function quality() {
  const value = process.env.OPENAI_IMAGE_QUALITY?.trim().toLowerCase();
  return ["low", "medium", "high", "auto"].includes(value ?? "") ? value! : "high";
}

function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Configure OPENAI_API_KEY para gerar criativos com a OpenAI.");
  return key;
}

class OpenAiApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** 404 = modelo inexistente para a conta, 403 = sem acesso (ex.: org não verificada). */
function isModelUnavailable(error: unknown) {
  return error instanceof OpenAiApiError && [400, 403, 404].includes(error.status);
}

async function request(path: string, body: Record<string, unknown> | FormData) {
  const isForm = body instanceof FormData;
  const response = await fetch(`${OPENAI_API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, ...(isForm ? {} : { "Content-Type": "application/json" }) },
    body: isForm ? body : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new OpenAiApiError(data?.error?.message ?? `Falha na OpenAI (HTTP ${response.status}).`, response.status);
  return data;
}

function blobOf(reference: ReferenceImage) {
  const match = reference.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) throw new Error("Formato de imagem de referência inválido.");
  return { blob: new Blob([Buffer.from(match[2], "base64")], { type: match[1] }), ext: match[1].split("/")[1] };
}

type UsageBlock = { input_tokens?: number; output_tokens?: number; total_tokens?: number };

function usageOf(usage: UsageBlock | undefined) {
  const inputTokens = Math.max(0, Number(usage?.input_tokens ?? 0) || 0);
  // Piso igual ao dos outros provedores, para o custo em créditos Postline de
  // um criativo continuar comparável entre eles.
  const outputTokens = Math.max(12_000, Number(usage?.output_tokens ?? 0) || 0);
  const totalTokens = Math.max(inputTokens + outputTokens, Number(usage?.total_tokens ?? 0) || 0);
  return { inputTokens, outputTokens, totalTokens, credits: totalTokens / 100_000 };
}

export async function generateOpenAiImage(prompt: string, size: ImageSize, references: ReferenceImage[] = []): Promise<GeneratedImage> {
  const { width, height } = IMAGE_DIMENSIONS[size];
  const dimensions = `${width}x${height}`;
  const chain = [...new Set([openaiImageModel(), ...MODELS])];

  let lastError: unknown;
  for (const model of chain) {
    try {
      let data;
      if (references.length) {
        const form = new FormData();
        form.set("model", model);
        form.set("prompt", prompt);
        form.set("size", dimensions);
        form.set("quality", quality());
        form.set("output_format", "jpeg");
        references.slice(0, 16).forEach((reference, index) => {
          const { blob, ext } = blobOf(reference);
          form.append("image[]", blob, reference.name || `referencia-${index + 1}.${ext}`);
        });
        data = await request("/images/edits", form);
      } else {
        data = await request("/images/generations", {
          model,
          prompt,
          size: dimensions,
          quality: quality(),
          output_format: "jpeg",
          n: 1,
        });
      }

      const base64 = data?.data?.[0]?.b64_json;
      if (!base64) throw new Error("A OpenAI não retornou a imagem. Tente novamente.");
      return { dataUrl: `data:image/jpeg;base64,${base64}`, mimeType: "image/jpeg", model, usage: usageOf(data?.usage) };
    } catch (error) {
      if (!isModelUnavailable(error)) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Nenhum modelo de imagem da OpenAI disponível para esta chave.");
}
