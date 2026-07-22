/**
 * Integração oficial com o Instagram via **Instagram API with Instagram Login**.
 * O usuário conecta a conta logando direto no Instagram (sem Página do Facebook):
 * o fluxo OAuth roda em instagram.com e todas as chamadas usam graph.instagram.com.
 *
 * Cada conta Instagram Business/Creator guarda seu próprio token long-lived
 * (~60 dias) no banco (`socialAccounts.accessToken`). Não há pageId/pageToken.
 *
 * Requisitos: conta Instagram Business ou Creator (perfil pessoal não funciona).
 * Permissões no app da Meta (produto "Instagram" → API with Instagram Login),
 * com Advanced Access após App Review:
 *   instagram_business_basic, instagram_business_manage_insights,
 *   instagram_business_manage_messages, instagram_business_manage_comments,
 *   instagram_business_content_publish
 */

const VERSION = () => process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH = () => `https://graph.instagram.com/${VERSION()}`;

/** Instagram app ID/secret (produto Instagram no app da Meta). Cai para META_* se não definido. */
function appId() {
  return process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || "";
}
function appSecret() {
  return process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || "";
}

export const META_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
].join(",");

export function metaOAuthConfigured() {
  return Boolean(appId() && appSecret());
}

export function metaRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/meta/connect/callback`;
}

/** URL de autorização do Instagram Login (o usuário faz login direto no Instagram). */
export function metaOAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: metaRedirectUri(),
    state,
    scope: META_SCOPES,
    response_type: "code",
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

type GraphError = { error?: { message?: string; type?: string; code?: number } };

async function graph<T = Record<string, unknown>>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH()}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as T & GraphError;
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Falha na Graph API (${res.status}).`);
  }
  return data;
}

async function graphPost<T = Record<string, unknown>>(path: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const data = (await res.json()) as T & GraphError;
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Falha na Graph API (${res.status}).`);
  }
  return data;
}

export type TokenResult = { token: string; userId: string };

/**
 * Troca o `code` do OAuth por um token de curta duração + o ID da conta.
 * O endpoint de token do Instagram Login fica em api.instagram.com.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenResult> {
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId(),
      client_secret: appSecret(),
      grant_type: "authorization_code",
      redirect_uri: metaRedirectUri(),
      // O Instagram pode devolver o code com `#_` no fim; limpamos por segurança.
      code: code.replace(/#_$/, ""),
    }),
    cache: "no-store",
  });
  const raw = (await res.json()) as
    | { access_token?: string; user_id?: string | number; error_message?: string; error_type?: string }
    | { data?: Array<{ access_token: string; user_id: string | number }> };
  if (!res.ok) {
    const msg = "error_message" in raw ? raw.error_message : undefined;
    throw new Error(msg || `Falha ao trocar o code por token (${res.status}).`);
  }
  // A resposta pode vir achatada ou dentro de `data: [...]`.
  const flat = "access_token" in raw ? raw : undefined;
  const nested = "data" in raw ? raw.data?.[0] : undefined;
  const token = flat?.access_token ?? nested?.access_token;
  const userId = flat?.user_id ?? nested?.user_id;
  if (!token || userId == null) throw new Error("Resposta de token inválida do Instagram.");
  return { token, userId: String(userId) };
}

/** Troca um token de curta duração por um long-lived (~60 dias). */
export async function getLongLivedToken(shortToken: string): Promise<string> {
  const data = await graph<{ access_token: string }>("/access_token", {
    grant_type: "ig_exchange_token",
    client_secret: appSecret(),
    access_token: shortToken,
  });
  return data.access_token;
}

/** Renova um token long-lived (deve ter ao menos 24h de vida e < 60 dias). */
export async function refreshLongLivedToken(token: string): Promise<string> {
  const data = await graph<{ access_token: string }>("/refresh_access_token", {
    grant_type: "ig_refresh_token",
    access_token: token,
  });
  return data.access_token;
}

export type DiscoveredAccount = {
  igId: string;
  username: string;
  name: string;
  followers: number;
  profilePicture: string | null;
};

/**
 * Busca a conta Instagram Business/Creator do token (Instagram Login = 1 conta por login).
 * Substitui a antiga descoberta via Páginas do Facebook.
 */
export async function getSelfAccount(token: string, fallbackId?: string): Promise<DiscoveredAccount> {
  const me = await graph<{
    user_id?: string;
    id?: string;
    username?: string;
    name?: string;
    followers_count?: number;
    profile_picture_url?: string;
  }>("/me", {
    access_token: token,
    fields: "user_id,username,name,followers_count,profile_picture_url",
  });
  const igId = me.user_id || me.id || fallbackId;
  if (!igId) throw new Error("Não foi possível identificar a conta Instagram.");
  return {
    igId: String(igId),
    username: me.username ?? "",
    name: me.name || me.username || "",
    followers: me.followers_count ?? 0,
    profilePicture: me.profile_picture_url ?? null,
  };
}

export type AccountSnapshot = {
  followers: number;
  reach: number;
  impressions: number;
  profileViews: number;
  mediaCount: number;
  username: string;
  profilePicture: string | null;
};

/** Métricas atuais de uma conta (perfil + insights do dia). Resiliente a métricas indisponíveis. */
export async function getAccountSnapshot(igId: string, token: string): Promise<AccountSnapshot> {
  const profile = await graph<{
    followers_count?: number;
    media_count?: number;
    username?: string;
    profile_picture_url?: string;
  }>(`/${igId}`, {
    access_token: token,
    fields: "followers_count,media_count,username,profile_picture_url",
  });

  const snapshot: AccountSnapshot = {
    followers: profile.followers_count ?? 0,
    reach: 0,
    impressions: 0,
    profileViews: 0,
    mediaCount: profile.media_count ?? 0,
    username: profile.username ?? "",
    profilePicture: profile.profile_picture_url ?? null,
  };

  try {
    // Alcance do dia via total_value (formato atual da API; profile_views foi
    // descontinuado no nível de conta em versões recentes).
    const insights = await graph<{ data: Array<{ name: string; total_value?: { value?: number } }> }>(
      `/${igId}/insights`,
      { access_token: token, metric: "reach", period: "day", metric_type: "total_value" }
    );
    for (const m of insights.data ?? []) {
      if (m.name === "reach") snapshot.reach = m.total_value?.value ?? 0;
    }
  } catch {
    // métricas de insights podem exigir período/idade da conta — ignora
  }
  return snapshot;
}

/**
 * Inscreve a conta nos eventos de webhook (comentários, mensagens, menções).
 * Sem isso, o Instagram não envia NENHUM evento — nem comentário nem DM.
 * Deve ser chamado após conectar a conta.
 */
export async function subscribeToWebhooks(
  igId: string,
  token: string,
  fields = "comments,messages"
): Promise<void> {
  await graphPost(`/${igId}/subscribed_apps`, { access_token: token, subscribed_fields: fields });
}

/** Envia um direct (mensagem) a partir de uma conta IG Business. */
export async function sendDirectMessage(igId: string, token: string, recipientId: string, text: string) {
  return graphPost(`/${igId}/messages`, {
    access_token: token,
    recipient: JSON.stringify({ id: recipientId }),
    message: JSON.stringify({ text }),
  });
}

/** Cria um container de mídia (foto ou vídeo/reel) e retorna o creation id. */
export async function createMediaContainer(
  igId: string,
  token: string,
  opts: { imageUrl?: string; videoUrl?: string; caption?: string; mediaType?: "REELS" | "STORIES" }
): Promise<string> {
  const body: Record<string, string> = { access_token: token };
  if (opts.caption) body.caption = opts.caption;
  if (opts.videoUrl) {
    body.media_type = opts.mediaType || "REELS";
    body.video_url = opts.videoUrl;
  } else if (opts.imageUrl) {
    if (opts.mediaType === "STORIES") body.media_type = "STORIES";
    body.image_url = opts.imageUrl;
  } else {
    throw new Error("Informe uma imagem ou vídeo para publicar.");
  }
  const data = await graphPost<{ id: string }>(`/${igId}/media`, body);
  return data.id;
}

/** Publica um container já criado. */
export async function publishMediaContainer(igId: string, token: string, creationId: string): Promise<string> {
  const data = await graphPost<{ id: string }>(`/${igId}/media_publish`, {
    access_token: token,
    creation_id: creationId,
  });
  return data.id;
}

export type RecentMedia = {
  id: string;
  caption: string;
  mediaType: string;
  mediaUrl: string | null;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
};

/** Lista as publicações recentes da conta (dados básicos + curtidas/comentários, que já vêm de graça). */
export async function getRecentMedia(igId: string, token: string, limit = 24): Promise<RecentMedia[]> {
  const data = await graph<{ data?: Array<Record<string, unknown>> }>(`/${igId}/media`, {
    access_token: token,
    fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
    limit: String(limit),
  });
  return (data.data ?? []).map((m) => ({
    id: String(m.id ?? ""),
    caption: String(m.caption ?? ""),
    mediaType: String(m.media_type ?? ""),
    mediaUrl: (m.media_url as string) ?? (m.thumbnail_url as string) ?? null,
    permalink: String(m.permalink ?? ""),
    timestamp: String(m.timestamp ?? ""),
    likeCount: Number(m.like_count ?? 0),
    commentsCount: Number(m.comments_count ?? 0),
  }));
}

export type MediaInsights = { likes: number; comments: number; shares: number; saves: number; reach: number; views: number };

/**
 * Insights reais de uma mídia publicada (post do feed/reel). Retorna alcance,
 * curtidas, comentários, salvamentos, compartilhamentos e visualizações.
 * Tenta incluir `views`; se a mídia não suportar, refaz sem essa métrica.
 */
export async function getMediaInsights(mediaId: string, token: string): Promise<MediaInsights> {
  const parse = (data: { data?: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value?: number } }> }): MediaInsights => {
    const out: MediaInsights = { likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, views: 0 };
    const map: Record<string, keyof MediaInsights> = { likes: "likes", comments: "comments", shares: "shares", saved: "saves", reach: "reach", views: "views" };
    for (const m of data.data ?? []) {
      const key = map[m.name];
      if (key) out[key] = m.total_value?.value ?? m.values?.[m.values.length - 1]?.value ?? 0;
    }
    return out;
  };
  try {
    return parse(await graph(`/${mediaId}/insights`, { access_token: token, metric: "reach,likes,comments,saved,shares,views" }));
  } catch {
    // `views` não é suportado por todo tipo de mídia — refaz sem ela.
    return parse(await graph(`/${mediaId}/insights`, { access_token: token, metric: "reach,likes,comments,saved,shares" }));
  }
}

/** Verifica o status de processamento de um container (útil para vídeos). */
export async function getContainerStatus(creationId: string, token: string): Promise<string> {
  const data = await graph<{ status_code?: string }>(`/${creationId}`, {
    access_token: token,
    fields: "status_code",
  });
  return data.status_code ?? "UNKNOWN";
}

/**
 * Publica uma foto simples: cria o container e publica.
 * Para vídeos/reels, aguarde o container ficar FINISHED antes de publicar.
 */
export async function publishImage(igId: string, token: string, imageUrl: string, caption?: string): Promise<string> {
  const creationId = await createMediaContainer(igId, token, { imageUrl, caption });
  return publishMediaContainer(igId, token, creationId);
}
