const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export class AiConfigurationError extends Error {}

/**
 * Modelos escolhidos para funcionar com uma chave GRATUITA do Google AI Studio.
 *
 * Texto: as variantes Flash são "free of charge" no tier gratuito e incluem
 * cota de grounding com Google Search (usado no radar de tendências).
 * Imagem: os modelos de imagem têm cota bem menor (e podem exigir billing na
 * conta). Por isso cada família tem uma lista de fallback: se o modelo
 * preferido responder 404/403/429, tentamos o próximo antes de falhar.
 */
const TEXT_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const IMAGE_MODELS = ["gemini-2.5-flash-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"];

function candidates(preferred: string | undefined, fallbacks: string[]) {
  return [...new Set([preferred?.trim(), ...fallbacks].filter(Boolean) as string[])];
}

export function textModel() {
  return candidates(process.env.GEMINI_TEXT_MODEL, TEXT_MODELS)[0];
}

export function imageModel() {
  return candidates(process.env.GEMINI_IMAGE_MODEL, IMAGE_MODELS)[0];
}

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiConfigurationError("Configure GEMINI_API_KEY na Vercel para ativar os recursos de IA.");
  return key;
}

/** Erro da API do Gemini com o status HTTP, para decidir se vale tentar outro modelo. */
class GeminiApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** 404 = modelo inexistente na chave, 403 = sem permissão/billing, 429 = cota estourada. */
function isModelUnavailable(error: unknown) {
  return error instanceof GeminiApiError && [403, 404, 429].includes(error.status);
}

type GeminiPart = { text?: string; inlineData?: { mimeType?: string; data?: string } };
type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
};

async function geminiRequest(model: string, body: Record<string, unknown>): Promise<GeminiResponse> {
  const response = await fetch(`${GEMINI_API_URL}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message ?? "Não foi possível concluir a geração.";
    throw new GeminiApiError(message, response.status);
  }
  return data;
}

/** Percorre os modelos candidatos até um responder; só troca de modelo em erro de disponibilidade. */
async function withModelFallback<T>(models: string[], run: (model: string) => Promise<T>) {
  let lastError: unknown;
  for (const model of models) {
    try {
      return await run(model);
    } catch (error) {
      if (!isModelUnavailable(error)) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Nenhum modelo Gemini disponível para esta chave.");
}

function parts(data: GeminiResponse) {
  return data.candidates?.[0]?.content?.parts ?? [];
}

function assertNotBlocked(data: GeminiResponse) {
  const blocked = data.promptFeedback?.blockReason;
  if (blocked) throw new Error(`A IA bloqueou o pedido (${blocked}). Ajuste o texto e tente novamente.`);
  const finish = data.candidates?.[0]?.finishReason;
  if (finish && !["STOP", "MAX_TOKENS"].includes(finish)) throw new Error(`A geração foi interrompida (${finish}). Ajuste o pedido e tente novamente.`);
}

function responseText(data: GeminiResponse) {
  return parts(data)
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Links do grounding do Google Search — as respostas citam as fontes por índice. */
function groundingSources(data: GeminiResponse) {
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const links = [...new Map(chunks.filter((chunk) => chunk.web?.uri).map((chunk) => [chunk.web!.uri!, chunk.web!.title || chunk.web!.uri!])).entries()];
  if (!links.length) return "";
  return `\n\n**Fontes consultadas**\n${links.map(([uri, title]) => `- [${title}](${uri})`).join("\n")}`;
}

type Usage = { inputTokens: number; outputTokens: number; totalTokens: number; credits: number };

/**
 * Converte o `usageMetadata` do Gemini no formato de créditos Postline
 * (1 crédito = 100.000 tokens). Os fallbacks cobrem respostas sem contagem.
 */
function usageOf(data: GeminiResponse, fallbackInput = 0, fallbackOutput = 0): Usage {
  const inputTokens = Math.max(Number(data.usageMetadata?.promptTokenCount ?? 0) || 0, fallbackInput);
  const outputTokens = Math.max(Number(data.usageMetadata?.candidatesTokenCount ?? 0) || 0, fallbackOutput);
  const totalTokens = Math.max(inputTokens + outputTokens, Number(data.usageMetadata?.totalTokenCount ?? 0) || 0);
  return { inputTokens, outputTokens, totalTokens, credits: totalTokens / 100_000 };
}

export type ReferenceImage = { name: string; type: string; dataUrl: string };

function inlineData(reference: ReferenceImage) {
  const match = reference.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) throw new Error("Formato de imagem de referência inválido.");
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

function userContent(text: string, references: ReferenceImage[]) {
  return [{ role: "user", parts: [{ text }, ...references.map(inlineData)] }];
}

export async function generateText(instructions: string, input: string, useWeb = false, references: ReferenceImage[] = []) {
  const models = candidates(process.env.GEMINI_TEXT_MODEL, TEXT_MODELS);
  const { model, data } = await withModelFallback(models, async (model) => ({
    model,
    data: await geminiRequest(model, {
      systemInstruction: { parts: [{ text: instructions }] },
      contents: userContent(input, references),
      ...(useWeb ? { tools: [{ googleSearch: {} }] } : {}),
    }),
  }));
  assertNotBlocked(data);
  const text = responseText(data);
  if (!text) throw new Error("A IA não retornou conteúdo. Tente novamente.");
  const approximateInput = Math.ceil((instructions.length + input.length) / 4);
  const approximateOutput = Math.ceil(text.length / 4);
  return { text: `${text}${useWeb ? groundingSources(data) : ""}`, model, usage: usageOf(data, approximateInput, approximateOutput) };
}

/** O app trabalha com tamanhos em pixels; o Gemini recebe proporção. */
const ASPECT_RATIOS = { "1024x1024": "1:1", "1024x1536": "2:3", "1536x1024": "3:2" } as const;
export type ImageSize = keyof typeof ASPECT_RATIOS;

export async function generateImage(prompt: string, size: ImageSize, references: ReferenceImage[] = []) {
  const models = candidates(process.env.GEMINI_IMAGE_MODEL, IMAGE_MODELS);
  const contents = userContent(prompt, references);
  // TEXT+IMAGE é a combinação aceita por toda a família de modelos de imagem;
  // pedir só IMAGE quebra em algumas versões.
  const responseModalities = ["TEXT", "IMAGE"];

  const { model, data } = await withModelFallback(models, async (model) => {
    const body = { contents, generationConfig: { responseModalities, imageConfig: { aspectRatio: ASPECT_RATIOS[size] } } };
    try {
      return { model, data: await geminiRequest(model, body) };
    } catch (error) {
      // Modelos mais antigos não aceitam `imageConfig`: repete sem a proporção.
      if (error instanceof GeminiApiError && error.status === 400) {
        return { model, data: await geminiRequest(model, { contents, generationConfig: { responseModalities } }) };
      }
      throw error;
    }
  }).catch((error: unknown) => {
    if (isModelUnavailable(error)) {
      throw new Error(`${error instanceof Error ? error.message : "Modelo indisponível."} Os modelos de imagem do Gemini têm cota gratuita reduzida — aguarde a renovação diária ou ative o faturamento no Google AI Studio.`);
    }
    throw error;
  });

  assertNotBlocked(data);
  const image = parts(data).find((part) => part.inlineData?.data && part.inlineData.mimeType?.startsWith("image/"));
  if (!image?.inlineData?.data) throw new Error("A IA não retornou a imagem. Tente novamente.");
  const mimeType = image.inlineData.mimeType ?? "image/png";
  // A geração de imagem é cobrada em tokens de saída; o piso mantém o custo em
  // créditos Postline compatível com o que um criativo realmente consome.
  return { dataUrl: `data:${mimeType};base64,${image.inlineData.data}`, mimeType, model, usage: usageOf(data, 0, 12_000) };
}
