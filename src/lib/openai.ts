const OPENAI_API_URL = "https://api.openai.com/v1";

export class AiConfigurationError extends Error {}

function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AiConfigurationError("Configure OPENAI_API_KEY na Vercel para ativar os recursos de IA.");
  return key;
}

async function openAiRequest(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${OPENAI_API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? "Não foi possível concluir a geração.";
    throw new Error(message);
  }
  return data;
}

function responseText(data: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
}

export async function generateText(instructions: string, input: string, useWeb = false) {
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna";
  const data = await openAiRequest("/responses", {
    model,
    instructions,
    input,
    ...(useWeb ? { tools: [{ type: "web_search" }] } : {}),
  });
  const text = responseText(data);
  if (!text) throw new Error("A IA não retornou conteúdo. Tente novamente.");
  return { text, model };
}

export async function generateImage(prompt: string, size: "1024x1024" | "1024x1536" | "1536x1024") {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const data = await openAiRequest("/images/generations", {
    model,
    prompt,
    size,
    quality: "medium",
    output_format: "png",
  });
  const base64 = data?.data?.[0]?.b64_json;
  if (!base64) throw new Error("A IA não retornou a imagem. Tente novamente.");
  return { dataUrl: `data:image/png;base64,${base64}`, model };
}
