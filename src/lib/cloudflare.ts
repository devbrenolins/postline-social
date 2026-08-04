import { IMAGE_DIMENSIONS, type GeneratedImage, type ImageSize } from "@/lib/ai-types";

const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4/accounts";

/**
 * Geração de imagem no Workers AI da Cloudflare — a alternativa gratuita ao
 * Gemini, cujos modelos de imagem têm cota ZERO no tier free do Google.
 *
 * A conta gratuita dá 10.000 neurons/dia. Modelos verificados com `pnpm ai:check`:
 * - FLUX.1 [schnell]: melhor qualidade, ~58 neurons por imagem (≈170/dia), mas
 *   só gera quadrado — não aceita largura/altura.
 * - SDXL Lightning (ByteDance): cobrado a US$ 0,00 por step (não consome a
 *   cota) e aceita largura/altura livres. Usado nos formatos não quadrados.
 *
 * Nenhum deles faz img2img: o campo `image_b64` aparece no schema, mas os
 * modelos publicados respondem "input tensor `image` is not present". As
 * imagens de referência são tratadas antes, virando texto (ver `ai.ts`).
 */
const FLUX = "@cf/black-forest-labs/flux-1-schnell";
const SDXL_LIGHTNING = "@cf/bytedance/stable-diffusion-xl-lightning";
const SDXL_BASE = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

/** Limite de prompt do FLUX; o SDXL não documenta limite, mas cortar é seguro. */
const MAX_PROMPT = 2048;

/** O SDXL tende a inventar texto ilegível em embalagens e cartazes. */
const NEGATIVE_PROMPT = "texto, letras, palavras, tipografia, legenda, marca d'água, logotipo, assinatura, moldura, baixa qualidade, borrado, deformado";

export function cloudflareConfigured() {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

/** Modelo usado no caso mais comum (formato quadrado). */
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
 * Os modelos respondem de dois jeitos: o FLUX devolve JSON com a imagem em
 * base64 e o SDXL devolve os bytes crus do PNG. Normaliza os dois.
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
  return { base64: bytes.toString("base64"), mimeType: sniffImageType(bytes) };
}

/**
 * O SDXL anuncia `content-type: image/png` mas devolve bytes JPEG, então o
 * cabeçalho não serve — o tipo real sai da assinatura do arquivo.
 */
function sniffImageType(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "image/png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "image/png";
}

export async function generateCloudflareImage(prompt: string, size: ImageSize): Promise<GeneratedImage> {
  const { width, height } = IMAGE_DIMENSIONS[size];
  const text = prompt.slice(0, MAX_PROMPT);
  const preferred = cloudflareImageModel();
  const square = width === height;

  const sdxl = (model: string) => ({ model, input: { prompt: text, width, height, num_steps: 20, negative_prompt: NEGATIVE_PROMPT } });
  const attempts = square && preferred === FLUX
    ? [{ model: FLUX, input: { prompt: text, steps: 8 } }, sdxl(SDXL_LIGHTNING), sdxl(SDXL_BASE)]
    : [sdxl(preferred === FLUX ? SDXL_LIGHTNING : preferred), sdxl(SDXL_BASE)];

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
