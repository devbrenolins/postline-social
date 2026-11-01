import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Criptografia em repouso dos tokens OAuth (AES-256-GCM).
 *
 * Formato gravado: `enc:v1:<iv>:<tag>:<dados>` (base64url). Valores sem esse
 * prefixo são tratados como texto puro legado e lidos normalmente — a migração
 * é gradual: cada token é regravado cifrado na próxima renovação/conexão.
 *
 * A chave vem de `TOKEN_ENCRYPTION_KEY` (32 bytes em hex ou base64). Gere com:
 *   openssl rand -base64 32
 * Sem a variável, o app continua funcionando e grava em texto puro, com aviso.
 * Perder a chave = todas as contas precisam ser reconectadas.
 */
const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const raw = (process.env.TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY deve ter 32 bytes (hex de 64 caracteres ou base64).");
  return buf;
}

let warned = false;

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) {
    if (!warned && process.env.NODE_ENV === "production") {
      warned = true;
      console.warn("[secret] TOKEN_ENCRYPTION_KEY ausente: tokens sendo gravados em texto puro.");
    }
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${data.toString("base64url")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const k = key();
  if (!k) throw new Error("Token criptografado, mas TOKEN_ENCRYPTION_KEY não está definida.");
  const [iv, tag, data] = stored.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
