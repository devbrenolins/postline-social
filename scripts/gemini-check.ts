/**
 * Testa a GEMINI_API_KEY do `.env.local` contra os modelos que o app usa.
 *
 *   pnpm gemini:check
 *
 * Mostra quais modelos a sua chave alcança (texto, pesquisa e imagem) — útil
 * porque o tier gratuito libera modelos diferentes conforme a conta.
 */
import "dotenv/config";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const key = process.env.GEMINI_API_KEY;

const TEXT = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const IMAGE = ["gemini-2.5-flash-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"];

async function probe(model: string, body: Record<string, unknown>) {
  const response = await fetch(`${API}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key!, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, detail: `HTTP ${response.status} — ${data?.error?.message ?? "erro desconhecido"}` };
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text).filter(Boolean).join(" ").trim();
  const image = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
  const tokens = data?.usageMetadata?.totalTokenCount ?? 0;
  return { ok: true, detail: `${image ? "imagem recebida" : `"${text.slice(0, 60)}"`} · ${tokens} tokens` };
}

async function main() {
  if (!key) {
    console.error("✗ GEMINI_API_KEY não definida. Cole a chave no .env.local (https://aistudio.google.com/apikey).");
    process.exit(1);
  }

  const checks: Array<[string, string, Record<string, unknown>]> = [
    ...TEXT.map((model): [string, string, Record<string, unknown>] => [
      "texto ", model, { contents: [{ role: "user", parts: [{ text: "Responda apenas: ok" }] }] },
    ]),
    ["busca ", TEXT[0], { contents: [{ role: "user", parts: [{ text: "Qual a data de hoje no Brasil?" }] }], tools: [{ googleSearch: {} }] }],
    ...IMAGE.map((model): [string, string, Record<string, unknown>] => [
      "imagem", model,
      { contents: [{ role: "user", parts: [{ text: "Um círculo rosa simples em fundo branco." }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "1:1" } } },
    ]),
  ];

  for (const [kind, model, body] of checks) {
    const result = await probe(model, body);
    console.log(`${result.ok ? "✓" : "✗"} ${kind}  ${model.padEnd(30)} ${result.detail}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
