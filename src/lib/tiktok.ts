/**
 * Integração com o **TikTok** — Login Kit + Content Posting API.
 *
 * Dois portões do lado do TikTok, que valem mais que qualquer detalhe de código:
 *
 * 1. **Auditoria do app.** Enquanto o cliente de API não passa pela auditoria,
 *    *"todo conteúdo publicado por clientes não auditados fica restrito ao modo
 *    de visualização privada"*. A integração funciona, mas o post nasce privado.
 * 2. **Posse da URL.** `PULL_FROM_URL` — o único modo que usamos, já que nossas
 *    mídias vivem em URL pública — exige verificar o domínio no portal do
 *    TikTok. Sem isso a API responde `url_ownership_unverified`.
 *
 * Diferente da Meta e do X, aqui o parâmetro é `client_key` (não `client_id`) e
 * os escopos são separados por vírgula.
 */
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";

const AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";

/**
 * `video.publish` publica direto no perfil; `video.upload` só manda para o
 * rascunho do app. Pedimos o primeiro — o segundo não serve para agendamento.
 */
export const TIKTOK_SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats", "video.publish"];

function clientKey() {
  return process.env.TIKTOK_CLIENT_KEY || "";
}
function clientSecret() {
  return process.env.TIKTOK_CLIENT_SECRET || "";
}

export function tiktokOAuthConfigured() {
  return Boolean(clientKey() && clientSecret());
}

export function tiktokRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/tiktok/connect/callback`;
}

/** O TikTok separa escopos por vírgula (a Meta usa vírgula, o X usa espaço). */
export function tiktokOAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_key: clientKey(),
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
    redirect_uri: tiktokRedirectUri(),
    state,
  });
  return `${AUTHORIZE}?${params}`;
}

export type TikTokTokens = {
  openId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
};

type TokenResponse = {
  open_id?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function requestToken(body: Record<string, string>): Promise<TikTokTokens> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: clientKey(), client_secret: clientSecret(), ...body }),
    cache: "no-store",
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Falha ao obter token do TikTok (${res.status}).`);
  }
  return {
    openId: data.open_id ?? "",
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    // Um minuto de folga evita usar um token que vence no meio da chamada.
    expiresAt: new Date(Date.now() + ((data.expires_in ?? 86_400) - 60) * 1000),
    scopes: data.scope ? data.scope.split(",").map((s) => s.trim()) : TIKTOK_SCOPES,
  };
}

export async function exchangeCodeForToken(code: string): Promise<TikTokTokens> {
  return requestToken({ code, grant_type: "authorization_code", redirect_uri: tiktokRedirectUri() });
}

export async function refreshAccessToken(refreshToken: string): Promise<TikTokTokens> {
  return requestToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/* ------------------------------------------------------------------ */
/*  Chamadas autenticadas                                              */
/* ------------------------------------------------------------------ */

type TikTokEnvelope<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string } };

/** O TikTok devolve 200 com `error.code = "ok"`; o erro real vem no corpo. */
async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  const body = (text ? JSON.parse(text) : {}) as TikTokEnvelope<T>;
  const code = body.error?.code;
  if (!res.ok || (code && code !== "ok")) {
    throw new Error(translate(code, body.error?.message, res.status));
  }
  return (body.data ?? ({} as T)) as T;
}

/** Traduz os erros que o desenvolvedor mais encontra em vez de repassar o código cru. */
function translate(code: string | undefined, message: string | undefined, status: number): string {
  switch (code) {
    case "url_ownership_unverified":
      return "O domínio das mídias não está verificado no portal do TikTok. Cadastre a URL/domínio em URL properties antes de publicar.";
    case "spam_risk_too_many_posts":
      return "O TikTok bloqueou por excesso de publicações recentes nesta conta. Tente mais tarde.";
    case "spam_risk_user_banned_from_posting":
      return "Esta conta está impedida de publicar pelo TikTok.";
    case "access_token_invalid":
    case "scope_not_authorized":
      return "A autorização do TikTok expirou ou foi revogada. Reconecte a conta.";
    case "rate_limit_exceeded":
      return "Limite de uso da API do TikTok atingido. Tente mais tarde.";
    default:
      return message || `Falha na API do TikTok (${code || status}).`;
  }
}

type Account = typeof socialAccounts.$inferSelect;

/**
 * Roda uma chamada com token válido. O access token do TikTok dura 24h e o
 * refresh token **rotaciona** — guardar o antigo desconecta a conta.
 */
export async function withFreshToken<T>(account: Account, fn: (token: string) => Promise<T>): Promise<T> {
  let token = account.accessToken;
  if (!token) throw new Error("Conta do TikTok sem token. Reconecte a conta.");

  const expired = !account.tokenExpiresAt || new Date(account.tokenExpiresAt).getTime() <= Date.now();
  if (expired) {
    if (!account.refreshToken) throw new Error("A sessão do TikTok expirou. Reconecte a conta.");
    const fresh = await refreshAccessToken(account.refreshToken);
    token = fresh.accessToken;
    await db
      .update(socialAccounts)
      .set({
        accessToken: fresh.accessToken,
        refreshToken: fresh.refreshToken ?? account.refreshToken,
        tokenExpiresAt: fresh.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, account.id));
  }
  return fn(token);
}

/* ------------------------------------------------------------------ */
/*  Perfil                                                             */
/* ------------------------------------------------------------------ */

export type TikTokProfile = {
  openId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followers: number;
  videos: number;
  likes: number;
};

const USER_FIELDS = "open_id,avatar_url,display_name,username,follower_count,likes_count,video_count";

export async function getProfile(token: string): Promise<TikTokProfile> {
  const data = await call<{ user?: Record<string, unknown> }>(`/user/info/?fields=${USER_FIELDS}`, token, { method: "GET" });
  const u = data.user ?? {};
  return {
    openId: String(u.open_id ?? ""),
    username: String(u.username ?? u.display_name ?? ""),
    displayName: String(u.display_name ?? ""),
    avatarUrl: (u.avatar_url as string) ?? null,
    followers: Number(u.follower_count ?? 0),
    videos: Number(u.video_count ?? 0),
    likes: Number(u.likes_count ?? 0),
  };
}

export type CreatorInfo = {
  nickname: string;
  avatarUrl: string | null;
  privacyOptions: string[];
  maxVideoSeconds: number;
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
};

/**
 * Dados que o TikTok exige consultar **antes** de publicar: as opções de
 * privacidade válidas para aquele criador (o `privacy_level` enviado precisa
 * ser uma delas) e o que a conta tem desativado.
 */
export async function getCreatorInfo(token: string): Promise<CreatorInfo> {
  const data = await call<Record<string, unknown>>("/post/publish/creator_info/query/", token, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
  return {
    nickname: String(data.creator_nickname ?? ""),
    avatarUrl: (data.creator_avatar_url as string) ?? null,
    privacyOptions: (data.privacy_level_options as string[]) ?? [],
    maxVideoSeconds: Number(data.max_video_post_duration_sec ?? 0),
    commentDisabled: Boolean(data.comment_disabled),
    duetDisabled: Boolean(data.duet_disabled),
    stitchDisabled: Boolean(data.stitch_disabled),
  };
}

/* ------------------------------------------------------------------ */
/*  Publicação                                                         */
/* ------------------------------------------------------------------ */

export type PrivacyLevel = "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";

export type PostOptions = {
  title: string;
  privacyLevel?: PrivacyLevel;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  coverTimestampMs?: number;
  autoAddMusic?: boolean;
};

/**
 * Escolhe um nível de privacidade que a conta aceite.
 *
 * O TikTok recusa a publicação quando o `privacy_level` não está entre os
 * devolvidos por `creator_info`. Contas privadas, por exemplo, não têm
 * `PUBLIC_TO_EVERYONE` — cair para a opção mais aberta disponível evita erro.
 */
export function resolvePrivacy(options: string[], desired?: PrivacyLevel): PrivacyLevel {
  const ordem: PrivacyLevel[] = ["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"];
  if (desired && options.includes(desired)) return desired;
  return (ordem.find((p) => options.includes(p)) ?? "SELF_ONLY") as PrivacyLevel;
}

/** Vídeo publicado direto no perfil, puxado de uma URL pública nossa. */
export async function postVideo(token: string, videoUrl: string, privacy: PrivacyLevel, opts: PostOptions): Promise<string> {
  const data = await call<{ publish_id?: string }>("/post/publish/video/init/", token, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: {
        title: opts.title.slice(0, 2200),
        privacy_level: privacy,
        disable_comment: opts.disableComment ?? false,
        disable_duet: opts.disableDuet ?? false,
        disable_stitch: opts.disableStitch ?? false,
        ...(opts.coverTimestampMs !== undefined ? { video_cover_timestamp_ms: opts.coverTimestampMs } : {}),
      },
      source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
    }),
  });
  if (!data.publish_id) throw new Error("O TikTok não devolveu o id da publicação.");
  return data.publish_id;
}

/** Carrossel de fotos (até 35), também por URL pública. */
export async function postPhotos(token: string, photoUrls: string[], privacy: PrivacyLevel, opts: PostOptions): Promise<string> {
  const data = await call<{ publish_id?: string }>("/post/publish/content/init/", token, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      media_type: "PHOTO",
      post_mode: "DIRECT_POST",
      post_info: {
        // No post de fotos o título tem limite curto; a legenda vai na descrição.
        title: opts.title.slice(0, 90),
        description: opts.title.slice(0, 4000),
        privacy_level: privacy,
        disable_comment: opts.disableComment ?? false,
        auto_add_music: opts.autoAddMusic ?? true,
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_images: photoUrls.slice(0, 35),
        photo_cover_index: 0,
      },
    }),
  });
  if (!data.publish_id) throw new Error("O TikTok não devolveu o id da publicação.");
  return data.publish_id;
}

export type PublishStatus = { status: string; failReason: string | null; postIds: string[] };

/** Estado de uma publicação. O envio é assíncrono: `init` só enfileira. */
export async function getPublishStatus(token: string, publishId: string): Promise<PublishStatus> {
  const data = await call<Record<string, unknown>>("/post/publish/status/fetch/", token, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ publish_id: publishId }),
  });
  return {
    status: String(data.status ?? "UNKNOWN"),
    failReason: (data.fail_reason as string) ?? null,
    // O campo tem esse nome (com o typo) na API do TikTok.
    postIds: (data.publicaly_available_post_id as string[]) ?? [],
  };
}

/** Mensagens dos motivos de falha que o TikTok devolve. */
export function explainFailure(reason: string | null): string {
  switch (reason) {
    case "file_format_check_failed":
      return "Formato de arquivo não aceito pelo TikTok.";
    case "duration_check_failed":
      return "A duração do vídeo está fora do permitido para esta conta.";
    case "frame_rate_check_failed":
      return "A taxa de quadros do vídeo não é aceita.";
    case "picture_size_check_failed":
      return "As dimensões da imagem não são aceitas.";
    case "video_pull_failed":
    case "photo_pull_failed":
      return "O TikTok não conseguiu baixar a mídia. A URL precisa ser pública e o domínio verificado no portal.";
    case "spam_risk_text":
    case "spam_risk":
      return "O TikTok classificou o conteúdo como risco de spam.";
    case "auth_removed":
      return "A autorização foi removida pelo usuário. Reconecte a conta.";
    case "publish_cancelled":
      return "A publicação foi cancelada.";
    default:
      return reason ? `O TikTok recusou a publicação (${reason}).` : "O TikTok recusou a publicação.";
  }
}
