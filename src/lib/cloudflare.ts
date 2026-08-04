import { IMAGE_DIMENSIONS, type GeneratedImage, type ImageSize } from "@/lib/ai-types";

const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4/accounts";

/**
 * Geração de imagem no Workers AI da Cloudflare — a alternativa gratuita ao
 * Gemini, cujos modelos de imagem têm cota ZERO no tier free do Google.
 *
 * Modelos verificados com chamadas reais (`pnpm ai:check`), em ordem de uso:
 * - FLUX.2 [klein] 4B: fotorrealismo de verdade, aceita largura/altura livres.
 *   ~104 neurons no quadrado e ~156 no 2:3 — com 10.000 neurons/dia grátis dá
 *   60 a 95 imagens, muito acima do limite de 8/dia do próprio Postline.
 *   Só aceita `multipart/form-data`; JSON devolve "required properties ...
 *   are 'multipart'".
 * - FLUX.1 [schnell]: bom, porém só gera quadrado (não aceita largura/altura).
 * - SDXL Lightning / Base: último recurso. Custam US$ 0,00 por step (não
 *   consomem a cota), mas a qualidade é bem inferior.
 *
 * Nenhum deles faz img2img: o `image_b64` do SDXL responde "input tensor
 * `image` is not present" e o FLUX.2 aceita o campo `image` mas ignora o
 * conteúdo. As referências viram texto antes de chegar aqui (ver `ai.ts`).
 */
const FLUX2_KLEIN = "@cf/black-forest-labs/flux-2-klein-4b";
const FLUX1_SCHNELL = "@cf/black-forest-labs/flux-1-schnell";
const SDXL_LIGHTNING = "@cf/bytedance/stable-diffusion-xl-lightning";
const SDXL_BASE = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

/** Limite de prompt do FLUX; o SDXL não documenta limite, mas cortar é seguro. */
const MAX_PROMPT = 2048;

const ATTEMPT_TIMEOUT_MS = 28_000;

/** O SDXL tende a inventar texto ilegível em embalagens e cartazes. */
const NEGATIVE_PROMPT = "texto, letras, palavras, tipografia, legenda, marca d'água, logotipo, assinatura, moldura, baixa qualidade, borrado, deformado";

export function cloudflareConfigured() {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

export function cloudflareImageModel() {
  return process.env.CLOUDFLARE_IMAGE_MODEL?.trim() || FLUX2_KLEIN;
}

function credentials() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error("Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN para gerar criativos.");
  return { accountId, token };
}

/**
 * Os modelos divergem no transporte (JSON x multipart) e na resposta (JSON com
 * base64 x bytes crus). Normaliza tudo para base64 + tipo real.
 */
async function runModel(model: string, input: Record<string, string | number>, multipart: boolean) {
  const { accountId, token } = credentials();

  let body: BodyInit;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (multipart) {
    const form = new FormData();
    for (const [key, value] of Object.entries(input)) form.set(key, String(value));
    body = form; // o boundary é definido pelo runtime
  } else {
    body = JSON.stringify(input);
    headers["Content-Type"] = "application/json";
  }

  // Timeout por tentativa: cabe uma segunda dentro do maxDuration de 60s da
  // rota, em vez de a requisição inteira morrer numa chamada pendurada.
  const response = await fetch(`${CLOUDFLARE_API_URL}/${accountId}/ai/run/${model}`, {
    method: "POST", headers, body, cache: "no-store", signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
      throw new Error(data?.errors?.[0]?.message ?? `Falha na Cloudflare (HTTP ${response.status}).`);
    }
    const base64 = data?.result?.image;
    if (typeof base64 !== "string" || !base64) throw new Error("A Cloudflare não retornou a imagem. Tente novamente.");
    return { base64, mimeType: sniffImageType(Buffer.from(base64.slice(0, 32), "base64")) };
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

type Attempt = { model: string; input: Record<string, string | number>; multipart: boolean };

function attemptsFor(model: string, prompt: string, width: number, height: number): Attempt[] {
  if (model === FLUX2_KLEIN) return [{ model, input: { prompt, width, height }, multipart: true }];
  if (model === FLUX1_SCHNELL) {
    // O schnell não aceita largura/altura: só entra na fila no formato quadrado.
    return width === height ? [{ model, input: { prompt, steps: 8 }, multipart: false }] : [];
  }
  return [{ model, input: { prompt, width, height, num_steps: 20, negative_prompt: NEGATIVE_PROMPT }, multipart: false }];
}

export async function generateCloudflareImage(prompt: string, size: ImageSize): Promise<GeneratedImage> {
  const { width, height } = IMAGE_DIMENSIONS[size];
  const text = prompt.slice(0, MAX_PROMPT);
  const preferred = cloudflareImageModel();
  const chain = [...new Set([preferred, FLUX2_KLEIN, FLUX1_SCHNELL, SDXL_LIGHTNING, SDXL_BASE])];
  const attempts = chain.flatMap((model) => attemptsFor(model, text, width, height));
  // Falha transitória na Cloudflare não deve rebaixar a qualidade: o modelo
  // preferido ganha uma segunda chance antes de o fallback entrar.
  if (attempts.length) attempts.splice(1, 0, attempts[0]);

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const { base64, mimeType } = await runModel(attempt.model, attempt.input, attempt.multipart);
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
