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

/**
 * Valida o `signed_request` que a Meta envia nos callbacks de deauthorize e de
 * exclusão de dados.
 *
 * Formato: `<assinatura>.<payload>`, ambos em base64url. A assinatura é o
 * HMAC-SHA256 do payload — em bytes crus, não em hex como no webhook.
 */
export function parseSignedRequest(signedRequest: string): { user_id?: string } | null {
  const secret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  if (!secret) return null;

  const [encodedSig, payload] = signedRequest.split(".");
  if (!encodedSig || !payload) return null;

  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(encodedSig, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
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
