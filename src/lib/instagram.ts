/**
 * Integração oficial com o Instagram via Facebook Graph API (Login for Business).
 * Suporta múltiplas contas Instagram Business por workspace: cada conta guarda
 * seu próprio Page Access Token (long-lived) no banco (`socialAccounts.accessToken`).
 *
 * Permissões necessárias no app da Meta (Advanced Access após App Review):
 *   instagram_basic, instagram_manage_insights, instagram_manage_messages,
 *   instagram_content_publish, pages_show_list, pages_read_engagement, business_management
 */

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;

export const META_SCOPES = [
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_manage_messages",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
].join(",");

export function metaOAuthConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function metaRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/meta/connect/callback`;
}

export function metaOAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: metaRedirectUri(),
    state,
    scope: META_SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/dialog/oauth?${params}`;
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

/** Troca o `code` do OAuth por um token de usuário de curta duração. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const data = await graph<{ access_token: string }>("/oauth/access_token", {
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: metaRedirectUri(),
    code,
  });
  return data.access_token;
}

/** Troca um token de curta duração por um long-lived (~60 dias). */
export async function getLongLivedToken(shortToken: string): Promise<string> {
  const data = await graph<{ access_token: string }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortToken,
  });
  return data.access_token;
}

export type DiscoveredAccount = {
  igId: string;
  username: string;
  name: string;
  followers: number;
  profilePicture: string | null;
  pageId: string;
  pageToken: string;
};

/** Lista todas as contas Instagram Business ligadas às Páginas do usuário. */
export async function listInstagramAccounts(userToken: string): Promise<DiscoveredAccount[]> {
  const pages = await graph<{ data: Array<{ id: string; access_token: string; name: string }> }>("/me/accounts", {
    access_token: userToken,
    fields: "id,name,access_token",
    limit: "100",
  });

  const accounts: DiscoveredAccount[] = [];
  for (const page of pages.data ?? []) {
    try {
      const detail = await graph<{
        instagram_business_account?: {
          id: string;
          username: string;
          name?: string;
          followers_count?: number;
          profile_picture_url?: string;
        };
      }>(`/${page.id}`, {
        access_token: page.access_token,
        fields: "instagram_business_account{id,username,name,followers_count,profile_picture_url}",
      });
      const ig = detail.instagram_business_account;
      if (!ig) continue;
      accounts.push({
        igId: ig.id,
        username: ig.username,
        name: ig.name || ig.username,
        followers: ig.followers_count ?? 0,
        profilePicture: ig.profile_picture_url ?? null,
        pageId: page.id,
        pageToken: page.access_token,
      });
    } catch {
      // Página sem IG Business vinculado ou sem permissão — ignora.
    }
  }
  return accounts;
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
    const insights = await graph<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(
      `/${igId}/insights`,
      { access_token: token, metric: "reach,profile_views", period: "day" }
    );
    for (const m of insights.data ?? []) {
      const value = m.values?.[m.values.length - 1]?.value ?? 0;
      if (m.name === "reach") snapshot.reach = value;
      if (m.name === "profile_views") snapshot.profileViews = value;
    }
  } catch {
    // métricas de insights podem exigir período/idade da conta — ignora
  }
  return snapshot;
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
