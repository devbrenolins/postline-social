import type { ImageSize, ReferenceImage } from "@/lib/ai-types";
import { IMAGE_DIMENSIONS } from "@/lib/ai-types";

const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4/accounts";

/**
 * Geração de imagem no Workers AI da Cloudflare — a alternativa gratuita ao
 * Gemini, cujos modelos de imagem têm cota ZERO no tier free do Google.
 *
 * A conta gratuita da Cloudflare dá 10.000 neurons/dia:
 * - FLUX.1 [schnell]: ~58 neurons por imagem (≈170 imagens/dia), melhor
 *   qualidade, mas só gera quadrado e não aceita imagem de referência.
 * - SDXL Lightning: cobrado a US$ 0,00 por step (não consome a cota), aceita
 *   largura/altura livres e img2img — usado quando o formato não é quadrado
 *   ou quando o usuário anexou referências.
 */
const FLUX = "@cf/black-forest-labs/flux-1-schnell";
const SDXL_LIGHTNING = "@cf/stabilityai/stable-diffusion-xl-lightning";
const SDXL_BASE = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

/** Limite de prompt do FLUX; o SDXL não documenta limite, mas cortar é seguro. */
const MAX_PROMPT = 2048;

export function cloudflareConfigured() {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

/** Modelo que será usado no caso mais comum (quadrado, sem referências). */
export function cloudflareImageModel() {
  return process.env.CLOUDFLARE_IMAGE_MODEL?.trim() || FLUX;
}

function credentials() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error("Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN para gerar criativos.");
  return { accountId, token };
}

/**
 * Os modelos respondem de dois jeitos: FLUX devolve JSON com a imagem em
 * base64 e o SDXL devolve os bytes crus da imagem. Normaliza os dois.
 */
async function runModel(model: string, input: Record<string, unknown>) {
  const { accountId, token } = credentials();
  const response = await fetch(`${CLOUDFLARE_API_URL}/${accountId}/ai/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
      throw new Error(data?.errors?.[0]?.message ?? `Falha na Cloudflare (HTTP ${response.status}).`);
    }
    const base64 = data?.result?.image;
    if (typeof base64 !== "string" || !base64) throw new Error("A Cloudflare não retornou a imagem. Tente novamente.");
    return { base64, mimeType: "image/jpeg" };
  }

  if (!response.ok) throw new Error(`Falha na Cloudflare (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("A Cloudflare não retornou a imagem. Tente novamente.");
  return { base64: bytes.toString("base64"), mimeType: contentType.split(";")[0] || "image/png" };
}

function base64Of(reference: ReferenceImage) {
  const match = reference.dataUrl.match(/^data:image\/(?:png|jpeg|webp);base64,(.+)$/);
  if (!match) throw new Error("Formato de imagem de referência inválido.");
  return match[1];
}

export async function generateCloudflareImage(prompt: string, size: ImageSize, references: ReferenceImage[] = []) {
  const { width, height } = IMAGE_DIMENSIONS[size];
  const text = prompt.slice(0, MAX_PROMPT);
  const reference = references[0];
  // FLUX só gera quadrado e ignora referências: nesses casos vai de SDXL.
  const useFlux = !reference && width === height && cloudflareImageModel() === FLUX;

  const attempts: Array<{ model: string; input: Record<string, unknown> }> = useFlux
    ? [
        { model: FLUX, input: { prompt: text, steps: 8 } },
        { model: SDXL_LIGHTNING, input: { prompt: text, width, height, num_steps: 20 } },
      ]
    : [
        {
          model: cloudflareImageModel() === FLUX ? SDXL_LIGHTNING : cloudflareImageModel(),
          input: {
            prompt: text,
            width,
            height,
            num_steps: 20,
            // strength < 1 preserva parte da composição da referência em vez de
            // recriar tudo do zero.
            ...(reference ? { image_b64: base64Of(reference), strength: 0.75 } : {}),
          },
        },
        { model: SDXL_BASE, input: { prompt: text, width, height, num_steps: 20, ...(reference ? { image_b64: base64Of(reference), strength: 0.75 } : {}) } },
      ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const { base64, mimeType } = await runModel(attempt.model, attempt.input);
      return {
        dataUrl: `data:${mimeType};base64,${base64}`,
        mimeType,
        model: attempt.model,
        // A Cloudflare não devolve tokens; mantém o mesmo custo em créditos
        // Postline que um criativo tinha antes, para os limites diários valerem.
        usage: { inputTokens: 0, outputTokens: 12_000, totalTokens: 12_000, credits: 12_000 / 100_000 },
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Não foi possível gerar o criativo na Cloudflare.");
}
