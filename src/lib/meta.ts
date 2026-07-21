import { createHmac, timingSafeEqual } from "crypto";

export function metaConfigured() {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID && process.env.META_APP_SECRET && process.env.META_VERIFY_TOKEN && process.env.META_WORKSPACE_ID);
}

export function verifyMetaSignature(rawBody: string, signature: string | null) {
  const secret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function sendInstagramDirect(recipientId: string, text: string) {
  const token = process.env.META_ACCESS_TOKEN;
  const userId = process.env.META_IG_USER_ID;
  const version = process.env.META_GRAPH_VERSION || "v23.0";
  if (!token || !userId) throw new Error("Integração Meta não configurada.");
  const response = await fetch(`https://graph.instagram.com/${version}/${userId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? "Falha ao enviar direct.");
  return data;
}
