import { cloudflareConfigured, cloudflareImageModel, generateCloudflareImage } from "@/lib/cloudflare";
import { aiConfigured, buildImagePrompt, generateGeminiImage, imageModel as geminiImageModel, planCreative } from "@/lib/gemini";
import { composeCreative } from "@/lib/creative";
import type { CreativePlan, CreativePlanDraft, GeneratedImage, ImageSize, ReferenceImage } from "@/lib/ai-types";

export { AiConfigurationError } from "@/lib/ai-types";
export type { CreativePlan, ImageSize, ReferenceImage } from "@/lib/ai-types";
export { aiConfigured, generateText, textModel } from "@/lib/gemini";

/**
 * Ponto único de entrada da IA do app.
 *
 * Texto, pesquisa e análises: sempre Gemini (funciona na chave gratuita).
 * Imagem: Cloudflare Workers AI por padrão, porque os modelos de imagem do
 * Gemini têm cota zero no tier gratuito. Se a Cloudflare não estiver
 * configurada, cai para o Gemini — que só responde com faturamento ativo.
 */
export type ImageProvider = "cloudflare" | "gemini";

export function imageProvider(): ImageProvider {
  const forced = process.env.IMAGE_PROVIDER?.trim().toLowerCase();
  if (forced === "gemini" || forced === "cloudflare") return forced;
  return cloudflareConfigured() ? "cloudflare" : "gemini";
}

export function imageConfigured() {
  return imageProvider() === "cloudflare" ? cloudflareConfigured() : aiConfigured();
}

export function imageModel() {
  return imageProvider() === "cloudflare" ? cloudflareImageModel() : geminiImageModel();
}

export async function generateImage(prompt: string, size: ImageSize, references: ReferenceImage[] = []): Promise<GeneratedImage> {
  if (imageProvider() === "gemini") return generateGeminiImage(prompt, size, references);

  // O Gemini reescreve o briefing como prompt fotográfico em inglês e absorve
  // as imagens de referência — os modelos da Cloudflare não fazem img2img.
  return generateCloudflareImage(await buildImagePrompt(prompt, references), size);
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T) =>
  (allowed as readonly string[]).includes(String(value)) ? (value as T) : fallback;
const color = (value: unknown, fallback: string) => (typeof value === "string" && HEX.test(value.trim()) ? value.trim() : fallback);
const line = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * Sanitiza a direção de arte antes de desenhar: cor que não é hex vira SVG
 * inválido e derruba o sharp, e copy sem limite estoura o layout.
 */
function normalizePlan(draft: CreativePlanDraft, fallbackPrompt: string): CreativePlan {
  return {
    imagePrompt: line(draft.imagePrompt, 1800) || fallbackPrompt,
    palette: {
      text: color(draft.palette?.text, "#ffffff"),
      accent: color(draft.palette?.accent, "#e8558f"),
      accentText: color(draft.palette?.accentText, "#ffffff"),
      scrim: color(draft.palette?.scrim, "#0b0b0f"),
    },
    layout: {
      zone: pick(draft.layout?.zone, ["top", "bottom", "center", "left", "right"] as const, "bottom"),
      align: pick(draft.layout?.align, ["left", "center"] as const, "left"),
      scrim: pick(draft.layout?.scrim, ["none", "gradient", "solid"] as const, "gradient"),
    },
    copy: {
      headline: line(draft.copy?.headline, 90),
      subheadline: line(draft.copy?.subheadline, 160),
      cta: line(draft.copy?.cta, 28),
    },
  };
}

export type GeneratedCreative = GeneratedImage & { plan: CreativePlan | null };

/**
 * Criativo completo: a IA desenha a direção de arte, a Cloudflare gera a foto
 * com espaço negativo reservado e o texto é composto por cima em vetor.
 *
 * Com `withText: false` (ou se o planejamento falhar) devolve só a foto — vale
 * mais entregar a imagem do que falhar a geração inteira.
 */
export async function generateCreative(brief: string, size: ImageSize, references: ReferenceImage[] = [], withText = true): Promise<GeneratedCreative> {
  if (!withText || imageProvider() === "gemini") {
    return { ...(await generateImage(brief, size, references)), plan: null };
  }

  let plan: CreativePlan | null = null;
  try {
    plan = normalizePlan(await planCreative(brief, references), brief);
  } catch {
    // Sem cota ou JSON inválido: cai para a foto sem texto.
  }

  const image = await generateCloudflareImage(plan?.imagePrompt ?? (await buildImagePrompt(brief, references)), size);
  if (!plan?.copy.headline) return { ...image, plan: null };

  const composed = await composeCreative(Buffer.from(image.dataUrl.split(",")[1], "base64"), plan);
  return {
    ...image,
    dataUrl: `data:image/jpeg;base64,${composed.toString("base64")}`,
    mimeType: "image/jpeg",
    plan,
  };
}
