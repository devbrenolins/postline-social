/** Tipos e constantes compartilhados pelos provedores de IA (Gemini e Cloudflare). */

export class AiConfigurationError extends Error {}

export type ReferenceImage = { name: string; type: string; dataUrl: string };

/** Formatos oferecidos no Studio, com a proporção e o tamanho de cada um. */
export const IMAGE_DIMENSIONS = {
  "1024x1024": { width: 1024, height: 1024, aspectRatio: "1:1" },
  "1024x1536": { width: 1024, height: 1536, aspectRatio: "2:3" },
  "1536x1024": { width: 1536, height: 1024, aspectRatio: "3:2" },
} as const;

export type ImageSize = keyof typeof IMAGE_DIMENSIONS;

export type CreativeZone = "top" | "bottom" | "center" | "left" | "right";
export type CreativeScrim = "none" | "gradient" | "solid";

/** Direção de arte de um criativo, decidida pela IA a cada geração. */
export type CreativePlan = {
  imagePrompt: string;
  palette: { text: string; accent: string; accentText: string; scrim: string };
  layout: { zone: CreativeZone; align: "left" | "center"; scrim: CreativeScrim };
  copy: { headline: string; subheadline: string; cta: string };
};

/** O mesmo plano como chega do modelo: ainda não validado. */
export type CreativePlanDraft = { [K in keyof CreativePlan]?: Partial<CreativePlan[K]> };

export type GeneratedImage = {
  dataUrl: string;
  mimeType: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; credits: number };
};
