/**
 * Integração com o **X (Twitter)** via API v2, restrita ao que o plano
 * gratuito permite.
 *
 * O que cabe no tier gratuito (confirmado na documentação, não no ar):
 *   - OAuth 2.0 com PKCE em contexto de usuário
 *   - `GET /2/users/me` — handle, nome, avatar e contagem de seguidores
 *   - `POST /2/tweets` — publicar texto, com mídia e em thread
 *   - `DELETE /2/tweets/:id`
 *
 * O que **não** cabe e por isso não existe aqui: métricas por post, busca,
 * leitura de timeline e menções. Tudo isso exige plano pago — se um dia entrar,
 * é só acrescentar; nada aqui impede.
 *
 * Diferente da Meta, o access token do X dura ~2h. Todo uso passa por
 * `withFreshToken`, que renova e regrava antes de chamar a API.
 */
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";

const API = "https://api.x.com/2";
const AUTHORIZE = "https://x.com/i/oauth2/authorize";
const TOKEN = "https://api.x.com/2/oauth2/token";

/** `offline.access` é o que garante o refresh token; sem ele a conta cai em 2h. */
export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];

function clientId() {
  return process.env.X_CLIENT_ID || "";
}
function clientSecret() {
  return process.env.X_CLIENT_SECRET || "";
}

export function xOAuthConfigured() {
  return Boolean(clientId() && clientSecret());
}

export function xRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/x/connect/callback`;
}

/** Cabeçalho Basic exigido na troca e na renovação de token (clientes confidenciais). */
function basicAuth() {
  return `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64")}`;
}

/* ------------------------------------------------------------------ */
/*  OAuth 2.0 + PKCE                                                   */
/* ------------------------------------------------------------------ */

export function createPkceVerifier() {
  return randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function xOAuthUrl(state: string, verifier: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: xRedirectUri(),
    scope: X_SCOPES.join(" "),
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE}?${params}`;
}

export type XTokens = { accessToken: string; refreshToken: string | null; expiresAt: Date };

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

async function requestToken(body: Record<string, string>): Promise<XTokens> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth() },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Falha ao obter token do X (${res.status}).`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    // Um minuto de folga evita usar um token que vence no meio da chamada.
    expiresAt: new Date(Date.now() + ((data.expires_in ?? 7200) - 60) * 1000),
  };
}

export async function exchangeCodeForToken(code: string, verifier: string): Promise<XTokens> {
  return requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: xRedirectUri(),
    code_verifier: verifier,
    client_id: clientId(),
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<XTokens> {
  return requestToken({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId() });
}

/* ------------------------------------------------------------------ */
/*  Chamadas autenticadas                                              */
/* ------------------------------------------------------------------ */

type XError = { title?: string; detail?: string; errors?: Array<{ message?: string }> };

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T & XError) : ({} as T & XError);
  if (!res.ok) {
    const detail = data.detail || data.errors?.[0]?.message || data.title;
    // 403 aqui quase sempre é recurso fora do plano gratuito, não erro de código.
    if (res.status === 403) {
      throw new Error(detail || "O X recusou a operação — normalmente é recurso fora do plano gratuito.");
    }
    if (res.status === 429) {
      throw new Error("Limite de uso da API do X atingido. Tente mais tarde.");
    }
    throw new Error(detail || `Falha na API do X (${res.status}).`);
  }
  return data;
}

type Account = typeof socialAccounts.$inferSelect;

/**
 * Roda uma chamada com token válido, renovando e regravando quando vencido.
 * Centralizar isso evita o bug clássico do X: token de 2h usado por um post
 * agendado que foi criado ontem.
 */
export async function withFreshToken<T>(account: Account, fn: (token: string) => Promise<T>): Promise<T> {
  let token = account.accessToken;
  if (!token) throw new Error("Conta do X sem token. Reconecte a conta.");

  const expired = !account.tokenExpiresAt || new Date(account.tokenExpiresAt).getTime() <= Date.now();
  if (expired) {
    if (!account.refreshToken) throw new Error("A sessão do X expirou. Reconecte a conta.");
    const fresh = await refreshAccessToken(account.refreshToken);
    token = fresh.accessToken;
    await db
      .update(socialAccounts)
      .set({
        accessToken: fresh.accessToken,
        // O X rotaciona o refresh token: guardar o antigo invalida a conta.
        refreshToken: fresh.refreshToken ?? account.refreshToken,
        tokenExpiresAt: fresh.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, account.id));
  }
  return fn(token);
}

export type XProfile = { id: string; username: string; name: string; avatarUrl: string | null; followers: number };

/** Perfil do dono do token. É a única leitura que o plano gratuito garante. */
export async function getMe(token: string): Promise<XProfile> {
  const data = await call<{ data?: { id?: string; username?: string; name?: string; profile_image_url?: string; public_metrics?: { followers_count?: number } } }>(
    "/users/me?user.fields=profile_image_url,public_metrics",
    token
  );
  const me = data.data ?? {};
  if (!me.id) throw new Error("Não foi possível identificar a conta do X.");
  return {
    id: String(me.id),
    username: me.username ?? "",
    name: me.name || me.username || "",
    // O avatar vem em tamanho "normal"; a versão maior é o mesmo caminho sem o sufixo.
    avatarUrl: me.profile_image_url ? me.profile_image_url.replace("_normal", "") : null,
    followers: me.public_metrics?.followers_count ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Publicação                                                         */
/* ------------------------------------------------------------------ */

/**
 * Sobe uma mídia e devolve o `media_id`.
 *
 * O upload é o ponto mais frágil da integração gratuita: baixamos o arquivo da
 * URL pública e reenviamos como multipart. Se o plano da conta não incluir
 * `media.write`, o X responde 403 e quem chama decide se publica só o texto.
 */
export async function uploadMedia(token: string, mediaUrl: string): Promise<string> {
  const file = await fetch(mediaUrl, { cache: "no-store" });
  if (!file.ok) throw new Error("Não foi possível baixar a mídia para enviar ao X.");
  const blob = await file.blob();

  const form = new FormData();
  form.append("media", blob);
  form.append("media_category", blob.type.startsWith("video/") ? "tweet_video" : "tweet_image");

  const data = await call<{ data?: { id?: string }; id?: string; media_id_string?: string }>("/media/upload", token, {
    method: "POST",
    body: form,
  });
  const id = data.data?.id ?? data.id ?? data.media_id_string;
  if (!id) throw new Error("O X não devolveu o id da mídia.");
  return String(id);
}

export type XPostResult = { id: string; url: string };

/** Publica um post. `replyTo` encadeia numa thread. */
export async function createPost(
  token: string,
  opts: { text: string; mediaIds?: string[]; replyTo?: string; username?: string }
): Promise<XPostResult> {
  const body: Record<string, unknown> = { text: opts.text };
  if (opts.mediaIds?.length) body.media = { media_ids: opts.mediaIds.slice(0, 4) };
  if (opts.replyTo) body.reply = { in_reply_to_tweet_id: opts.replyTo };

  const data = await call<{ data?: { id?: string } }>("/tweets", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const id = data.data?.id;
  if (!id) throw new Error("O X não devolveu o id da publicação.");
  return { id: String(id), url: `https://x.com/${opts.username || "i"}/status/${id}` };
}

export async function deletePost(token: string, postId: string): Promise<void> {
  await call(`/tweets/${postId}`, token, { method: "DELETE" });
}

/** Limite de caracteres de um post no X. */
export const X_CHAR_LIMIT = 280;

/**
 * Divide um texto longo em thread, quebrando em espaço para não cortar palavra.
 * Publicar 280 caracteres é grátis; a thread é o jeito gratuito de publicar mais.
 */
export function splitIntoThread(text: string, limit = X_CHAR_LIMIT): string[] {
  const clean = text.trim();
  if (clean.length <= limit) return [clean];

  const parts: string[] = [];
  let rest = clean;
  while (rest.length > limit) {
    // Reserva espaço para o marcador " (n/m)" acrescentado no fim.
    const room = limit - 8;
    let cut = rest.lastIndexOf(" ", room);
    if (cut <= 0) cut = room;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.map((part, i) => `${part} (${i + 1}/${parts.length})`);
}
