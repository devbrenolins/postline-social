/**
 * Testa as credenciais de IA do `.env.local` contra os modelos que o app usa.
 *
 *   pnpm ai:check
 *
 * Mostra o que a sua conta realmente alcança — o tier gratuito libera modelos
 * diferentes conforme a conta, então é mais rápido conferir aqui do que
 * descobrir na tela do Studio.
 */
import { config } from "dotenv";

// Carrega .env.local (convenção Next.js) com fallback para .env.
config({ path: ".env.local" });
config();

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4/accounts";

const geminiKey = process.env.GEMINI_API_KEY;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;

const TEXT = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.6-flash"];
const GEMINI_IMAGE = ["gemini-2.5-flash-image", "gemini-3.1-flash-image"];
const CLOUDFLARE_IMAGE = [
  ["@cf/black-forest-labs/flux-2-klein-4b", { prompt: "A simple pink circle on a white background.", width: 1024, height: 1536 }],
  ["@cf/black-forest-labs/flux-1-schnell", { prompt: "Um círculo rosa simples em fundo branco.", steps: 4 }],
  ["@cf/bytedance/stable-diffusion-xl-lightning", { prompt: "Um círculo rosa simples em fundo branco.", width: 1024, height: 1536, num_steps: 20 }],
  ["@cf/stabilityai/stable-diffusion-xl-base-1.0", { prompt: "Um círculo rosa simples em fundo branco.", width: 1024, height: 1536, num_steps: 20 }],
] as const;

type Result = { ok: boolean; detail: string };

function line(kind: string, model: string, result: Result) {
  console.log(`${result.ok ? "✓" : "✗"} ${kind}  ${model.padEnd(46)} ${result.detail}`);
}

async function probeGemini(model: string, body: Record<string, unknown>): Promise<Result> {
  const response = await fetch(`${GEMINI_API}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": geminiKey!, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, detail: `HTTP ${response.status} — ${String(data?.error?.message ?? "erro desconhecido").split("\n")[0]}` };
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text).filter(Boolean).join(" ").trim();
  const image = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
  const sources = data?.candidates?.[0]?.groundingMetadata?.groundingChunks?.length ?? 0;
  return { ok: true, detail: `${image ? "imagem recebida" : `"${text.slice(0, 45)}"`}${sources ? ` · ${sources} fontes` : ""}` };
}

async function probeCloudflare(model: string, input: Record<string, unknown>): Promise<Result> {
  // O FLUX.2 só aceita multipart/form-data; os demais, JSON.
  const multipart = model.includes("flux-2");
  const headers: Record<string, string> = { Authorization: `Bearer ${cloudflareToken}` };
  let body: BodyInit;
  if (multipart) {
    const form = new FormData();
    for (const [key, value] of Object.entries(input)) form.set(key, String(value));
    body = form;
  } else {
    body = JSON.stringify(input);
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${CLOUDFLARE_API}/${accountId}/ai/run/${model}`, { method: "POST", headers, body });
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) return { ok: false, detail: `HTTP ${response.status} — ${data?.errors?.[0]?.message ?? "erro desconhecido"}` };
    const bytes = Math.round((String(data?.result?.image ?? "").length * 3) / 4 / 1024);
    return { ok: true, detail: `imagem base64 · ~${bytes} KB` };
  }
  if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
  const bytes = (await response.arrayBuffer()).byteLength;
  return { ok: true, detail: `${contentType.split(";")[0]} · ~${Math.round(bytes / 1024)} KB` };
}

async function main() {
  console.log("— Gemini (texto, pesquisa e imagem) —");
  if (!geminiKey) {
    console.log("✗ GEMINI_API_KEY não definida. Chave gratuita em https://aistudio.google.com/apikey");
  } else {
    for (const model of TEXT) {
      line("texto ", model, await probeGemini(model, { contents: [{ role: "user", parts: [{ text: "Responda apenas: ok" }] }] }));
    }
    for (const model of TEXT) {
      line("busca ", model, await probeGemini(model, { contents: [{ role: "user", parts: [{ text: "Qual a data de hoje no Brasil?" }] }], tools: [{ googleSearch: {} }] }));
    }
    for (const model of GEMINI_IMAGE) {
      line("imagem", model, await probeGemini(model, {
        contents: [{ role: "user", parts: [{ text: "Um círculo rosa simples em fundo branco." }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "1:1" } },
      }));
    }
  }

  console.log("\n— Cloudflare Workers AI (criativos) —");
  if (!accountId || !cloudflareToken) {
    console.log("✗ CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN não definidos. Conta gratuita em https://dash.cloudflare.com");
    return;
  }
  for (const [model, input] of CLOUDFLARE_IMAGE) {
    line("imagem", model, await probeCloudflare(model, input));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
