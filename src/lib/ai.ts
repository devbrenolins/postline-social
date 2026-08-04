import { cloudflareConfigured, cloudflareImageModel, generateCloudflareImage } from "@/lib/cloudflare";
import { aiConfigured, buildImagePrompt, generateGeminiImage, imageModel as geminiImageModel } from "@/lib/gemini";
import type { GeneratedImage, ImageSize, ReferenceImage } from "@/lib/ai-types";

export { AiConfigurationError } from "@/lib/ai-types";
export type { ImageSize, ReferenceImage } from "@/lib/ai-types";
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
