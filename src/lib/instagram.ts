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
  /** ID app-scoped — o que a Meta usa no `entry.id` de alguns webhooks. */
  appScopedId: string | null;
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
  // `user_id` é o ID da conta profissional e `id` é o app-scoped. São números
  // diferentes e a Meta usa um ou outro conforme o endpoint — guardamos os dois.
  const appScoped = me.id && me.id !== igId ? me.id : fallbackId && fallbackId !== igId ? fallbackId : null;
  return {
    igId: String(igId),
    appScopedId: appScoped ? String(appScoped) : null,
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

export type DayTotals = {
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  total_interactions: number;
  profile_views: number;
  website_clicks: number;
  accounts_engaged: number;
  replies: number;
};
export type DayInsight = DayTotals & { day: string; endTime: number };

/**
 * Métricas de conta que só existem no formato `total_value`.
 * Todas cabem numa chamada só — pedir separado seria desperdício de cota.
 */
const DAY_METRICS =
  "reach,views,likes,comments,shares,saves,total_interactions,profile_views,website_clicks,accounts_engaged,replies";

function emptyTotals(): DayTotals {
  return {
    reach: 0,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    total_interactions: 0,
    profile_views: 0,
    website_clicks: 0,
    accounts_engaged: 0,
    replies: 0,
  };
}

type TotalValueResponse = { data?: Array<{ name: string; total_value?: { value?: number } }> };

function readTotals(data: TotalValueResponse): DayTotals {
  const out = emptyTotals();
  for (const m of data.data ?? []) {
    if (m.name in out) out[m.name as keyof DayTotals] = m.total_value?.value ?? 0;
  }
  return out;
}

/**
 * Totais do dia corrente (parciais, sobem ao longo do dia).
 * `views`, `likes` etc. só existem como `total_value` — não vêm em série temporal.
 */
export async function getAccountDayTotals(igId: string, token: string): Promise<DayTotals> {
  try {
    return readTotals(
      await graph<TotalValueResponse>(`/${igId}/insights`, {
        access_token: token,
        metric: DAY_METRICS,
        period: "day",
        metric_type: "total_value",
      })
    );
  } catch {
    // Conta nova ou métrica indisponível: tenta só o alcance antes de desistir.
    try {
      return readTotals(
        await graph<TotalValueResponse>(`/${igId}/insights`, { access_token: token, metric: "reach", period: "day", metric_type: "total_value" })
      );
    } catch {
      return emptyTotals();
    }
  }
}

/**
 * Série diária de alcance dos últimos dias (uma única chamada, até 30 dias).
 *
 * Serve a dois propósitos: traz o histórico de alcance de uma vez e revela as
 * **fronteiras de dia da conta** (`end_time`), que dependem do fuso do perfil.
 * Usamos esses limites para pedir o resto das métricas dia a dia sem chutar
 * fuso horário.
 */
export async function getAccountReachSeries(igId: string, token: string, days = 30): Promise<Array<{ day: string; endTime: number; reach: number }>> {
  const until = Math.floor(Date.now() / 1000);
  const since = until - Math.min(days, 30) * 86_400;
  const data = await graph<{ data?: Array<{ name: string; values?: Array<{ value: number; end_time: string }> }> }>(
    `/${igId}/insights`,
    { access_token: token, metric: "reach", period: "day", since: String(since), until: String(until) }
  );
  const series = data.data?.find((m) => m.name === "reach")?.values ?? [];
  return series.map((v) => {
    const endTime = Math.floor(new Date(v.end_time).getTime() / 1000);
    return { day: dayOfPeriod(endTime), endTime, reach: v.value ?? 0 };
  });
}

/**
 * Totais de um dia fechado.
 *
 * A janela sai do `end_time` que a série de alcance devolveu, então cai na
 * fronteira de dia do fuso do perfil sem chute. A API agrega todo período cujo
 * `end_time` cai em `[since, until]` — inclusive nas duas pontas —, por isso o
 * `since` entra 1s depois da fronteira anterior: com `end - 86400` viriam dois
 * dias somados.
 */
export async function getAccountDayDetail(igId: string, token: string, endTime: number): Promise<DayTotals> {
  try {
    return readTotals(
      await graph<TotalValueResponse>(`/${igId}/insights`, {
        access_token: token,
        metric: DAY_METRICS,
        period: "day",
        metric_type: "total_value",
        since: String(endTime - 86_399),
        until: String(endTime),
      })
    );
  } catch {
    return emptyTotals();
  }
}

/**
 * Dia (YYYY-MM-DD) a que pertence um período que termina em `endTime`.
 * O `end_time` da Meta é a meia-noite *seguinte* no fuso do perfil; recuar 12h
 * cai no meio do dia certo em qualquer fuso.
 */
export function dayOfPeriod(endTime: number): string {
  return new Date((endTime - 43_200) * 1000).toISOString().slice(0, 10);
}

export type Breakdown = { dimension: string; label: string; value: number };

type BreakdownResponse = {
  data?: Array<{
    name: string;
    total_value?: { breakdowns?: Array<{ dimension_keys?: string[]; results?: Array<{ dimension_values?: string[]; value?: number }> }> };
  }>;
};

/**
 * Recorte de `views` e `reach` de um dia por uma dimensão da Meta.
 *
 * `follow_type` separa seguidor de não seguidor (o quanto o conteúdo alcança
 * gente nova) e `media_product_type` separa reel, story, post, carrossel e
 * **anúncio** — sem isso o alcance pago fica misturado no orgânico.
 */
export async function getAccountDayBreakdown(
  igId: string,
  token: string,
  endTime: number,
  dimension: "follow_type" | "media_product_type"
): Promise<Record<string, Breakdown[]>> {
  const out: Record<string, Breakdown[]> = {};
  try {
    const data = await graph<BreakdownResponse>(`/${igId}/insights`, {
      access_token: token,
      metric: "views,reach",
      period: "day",
      metric_type: "total_value",
      breakdown: dimension,
      since: String(endTime - 86_399),
      until: String(endTime),
    });
    for (const m of data.data ?? []) {
      const results = m.total_value?.breakdowns?.[0]?.results ?? [];
      out[m.name] = results
        .filter((r) => r.dimension_values?.[0])
        .map((r) => ({ dimension, label: String(r.dimension_values![0]), value: r.value ?? 0 }));
    }
  } catch {
    // Recorte indisponível não invalida o resto do dia.
  }
  return out;
}

/**
 * Ganho líquido de seguidores por dia (`follower_count`), em série temporal.
 * É o único jeito de reconstruir o histórico: a API só devolve o total de
 * seguidores de hoje, nunca o de uma data passada.
 */
export async function getFollowerDeltaSeries(igId: string, token: string, days = 30): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const until = Math.floor(Date.now() / 1000);
    const since = until - Math.min(days, 30) * 86_400;
    const data = await graph<{ data?: Array<{ name: string; values?: Array<{ value: number; end_time: string }> }> }>(
      `/${igId}/insights`,
      { access_token: token, metric: "follower_count", period: "day", since: String(since), until: String(until) }
    );
    for (const v of data.data?.[0]?.values ?? []) {
      out.set(dayOfPeriod(Math.floor(new Date(v.end_time).getTime() / 1000)), v.value ?? 0);
    }
  } catch {
    // Contas com menos de 100 seguidores não recebem essa métrica.
  }
  return out;
}

export type Demographics = { metric: "followers" | "reached"; dimension: string; label: string; value: number };

const DEMOGRAPHIC_DIMENSIONS = ["city", "country", "age", "gender"] as const;

/**
 * Perfil da audiência: de onde ela é, que idade tem e qual o gênero — tanto de
 * quem segue quanto de quem foi alcançado. É `lifetime`, não muda de hora em
 * hora, então basta sincronizar uma vez por dia.
 */
export async function getAudienceDemographics(igId: string, token: string): Promise<Demographics[]> {
  const out: Demographics[] = [];
  const sources = [
    { metric: "followers" as const, apiMetric: "follower_demographics" },
    { metric: "reached" as const, apiMetric: "reached_audience_demographics" },
  ];
  for (const src of sources) {
    for (const dimension of DEMOGRAPHIC_DIMENSIONS) {
      try {
        const data = await graph<BreakdownResponse>(`/${igId}/insights`, {
          access_token: token,
          metric: src.apiMetric,
          period: "lifetime",
          metric_type: "total_value",
          breakdown: dimension,
          timeframe: "this_month",
        });
        for (const r of data.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []) {
          const label = r.dimension_values?.[0];
          if (label) out.push({ metric: src.metric, dimension, label: String(label).slice(0, 160), value: r.value ?? 0 });
        }
      } catch {
        // "Not enough users" é resposta normal em conta pequena.
      }
    }
  }
  return out;
}

/** Perfil completo da conta (o que `getSelfAccount` não traz). */
export async function getAccountProfile(igId: string, token: string) {
  return graph<{
    username?: string;
    name?: string;
    biography?: string;
    website?: string;
    account_type?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
    profile_picture_url?: string;
  }>(`/${igId}`, {
    access_token: token,
    fields: "username,name,biography,website,account_type,followers_count,follows_count,media_count,profile_picture_url",
  });
}

/** Quota de publicação nas últimas 24h — evita descobrir o limite só no erro. */
export async function getPublishingLimit(igId: string, token: string): Promise<{ used: number; total: number }> {
  try {
    const data = await graph<{ data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }> }>(
      `/${igId}/content_publishing_limit`,
      { access_token: token, fields: "config,quota_usage" }
    );
    const row = data.data?.[0];
    return { used: row?.quota_usage ?? 0, total: row?.config?.quota_total ?? 100 };
  } catch {
    return { used: 0, total: 100 };
  }
}

export type StoryItem = {
  id: string;
  mediaType: string;
  mediaUrl: string | null;
  permalink: string;
  timestamp: string;
  reach: number;
  views: number;
  replies: number;
};

/** Stories no ar (a Meta só devolve as últimas 24h) com os insights de cada um. */
export async function getActiveStories(igId: string, token: string): Promise<StoryItem[]> {
  const data = await graph<{ data?: Array<Record<string, unknown>> }>(`/${igId}/stories`, {
    access_token: token,
    fields: "id,media_type,media_url,thumbnail_url,permalink,timestamp",
  });
  const items = data.data ?? [];
  return Promise.all(
    items.map(async (m) => {
      const base: StoryItem = {
        id: String(m.id ?? ""),
        mediaType: String(m.media_type ?? ""),
        mediaUrl: (m.media_url as string) ?? (m.thumbnail_url as string) ?? null,
        permalink: String(m.permalink ?? ""),
        timestamp: String(m.timestamp ?? ""),
        reach: 0,
        views: 0,
        replies: 0,
      };
      try {
        const ins = await graph<{ data?: Array<{ name: string; values?: Array<{ value: number }> }> }>(
          `/${base.id}/insights`,
          { access_token: token, metric: "reach,views,replies" }
        );
        for (const metric of ins.data ?? []) {
          const value = metric.values?.[0]?.value ?? 0;
          if (metric.name === "reach") base.reach = value;
          if (metric.name === "views") base.views = value;
          if (metric.name === "replies") base.replies = value;
        }
      } catch {
        // Story recém-publicado ainda não tem insights.
      }
      return base;
    })
  );
}

export type TaggedMedia = {
  id: string;
  username: string;
  caption: string;
  mediaUrl: string | null;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
};

/** Publicações de terceiros em que o perfil foi marcado. */
export async function getTaggedMedia(igId: string, token: string, limit = 24): Promise<TaggedMedia[]> {
  const data = await graph<{ data?: Array<Record<string, unknown>> }>(`/${igId}/tags`, {
    access_token: token,
    fields: "id,username,caption,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
    limit: String(limit),
  });
  return (data.data ?? []).map((m) => ({
    id: String(m.id ?? ""),
    username: String(m.username ?? ""),
    caption: String(m.caption ?? ""),
    mediaUrl: (m.media_url as string) ?? (m.thumbnail_url as string) ?? null,
    permalink: String(m.permalink ?? ""),
    timestamp: String(m.timestamp ?? ""),
    likeCount: Number(m.like_count ?? 0),
    commentsCount: Number(m.comments_count ?? 0),
  }));
}

export type IgComment = {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  likeCount: number;
  hidden: boolean;
  replies: { id: string; text: string; username: string; timestamp: string }[];
};

/** Comentários de uma publicação, com as respostas aninhadas. */
export async function getMediaComments(mediaId: string, token: string, limit = 50): Promise<IgComment[]> {
  const data = await graph<{ data?: Array<Record<string, unknown>> }>(`/${mediaId}/comments`, {
    access_token: token,
    fields: "id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp}",
    limit: String(limit),
  });
  return (data.data ?? []).map((c) => ({
    id: String(c.id ?? ""),
    text: String(c.text ?? ""),
    username: String(c.username ?? ""),
    timestamp: String(c.timestamp ?? ""),
    likeCount: Number(c.like_count ?? 0),
    hidden: Boolean(c.hidden),
    replies: (((c.replies as { data?: Array<Record<string, unknown>> })?.data) ?? []).map((r) => ({
      id: String(r.id ?? ""),
      text: String(r.text ?? ""),
      username: String(r.username ?? ""),
      timestamp: String(r.timestamp ?? ""),
    })),
  }));
}

/** Responde publicamente a um comentário. */
export async function replyToComment(commentId: string, token: string, message: string) {
  return graphPost<{ id: string }>(`/${commentId}/replies`, { access_token: token, message });
}

/** Oculta/reexibe um comentário (não apaga — some para os outros). */
export async function setCommentHidden(commentId: string, token: string, hide: boolean) {
  return graphPost(`/${commentId}`, { access_token: token, hide: hide ? "true" : "false" });
}

/** Apaga um comentário do próprio perfil. */
export async function deleteComment(commentId: string, token: string) {
  const res = await fetch(`${GRAPH()}/${commentId}?access_token=${encodeURIComponent(token)}`, {
    method: "DELETE",
    cache: "no-store",
  });
  const data = (await res.json()) as GraphError;
  if (!res.ok || data.error) throw new Error(data.error?.message || "Falha ao apagar o comentário.");
}

export type Conversation = {
  id: string;
  updatedTime: string;
  participants: { id: string; username: string }[];
};

/** Conversas de direct já existentes — o webhook só entrega o que chega depois. */
export async function getConversations(igId: string, token: string, limit = 30): Promise<Conversation[]> {
  const data = await graph<{ data?: Array<Record<string, unknown>> }>(`/${igId}/conversations`, {
    access_token: token,
    fields: "id,updated_time,participants",
    limit: String(limit),
  });
  return (data.data ?? []).map((t) => ({
    id: String(t.id ?? ""),
    updatedTime: String(t.updated_time ?? ""),
    participants: (((t.participants as { data?: Array<Record<string, unknown>> })?.data) ?? []).map((p) => ({
      id: String(p.id ?? ""),
      username: String(p.username ?? ""),
    })),
  }));
}

export type ConversationMessage = { id: string; text: string; from: string; createdTime: string };

/** Histórico de uma conversa. */
export async function getConversationMessages(conversationId: string, token: string, limit = 30): Promise<ConversationMessage[]> {
  const data = await graph<{ data?: Array<Record<string, unknown>> }>(`/${conversationId}/messages`, {
    access_token: token,
    fields: "id,message,from,created_time",
    limit: String(limit),
  });
  return (data.data ?? []).map((m) => ({
    id: String(m.id ?? ""),
    text: String(m.message ?? ""),
    from: String((m.from as { username?: string; id?: string })?.username ?? (m.from as { id?: string })?.id ?? ""),
    createdTime: String(m.created_time ?? ""),
  }));
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

/**
 * Resposta privada a um comentário ("comente X que eu te mando no direct").
 *
 * Usa `recipient.comment_id` em vez de `recipient.id`: é o único caminho que a
 * Meta permite para abrir uma conversa a partir de um comentário, e só funciona
 * uma vez por comentário, dentro de 7 dias.
 */
export async function sendCommentPrivateReply(igId: string, token: string, commentId: string, text: string) {
  return graphPost(`/${igId}/messages`, {
    access_token: token,
    recipient: JSON.stringify({ comment_id: commentId }),
    message: JSON.stringify({ text }),
  });
}

/** Extras que a Meta aceita na criação do container e que o app expõe no composer. */
export type PublishExtras = {
  /** ID de local do Facebook Places. */
  locationId?: string;
  /** Perfis convidados como coautores (só feed e reels). */
  collaborators?: string[];
  /** Marcações de perfis na imagem, com posição relativa 0–1. */
  userTags?: { username: string; x?: number; y?: number }[];
  /** Texto alternativo para leitores de tela (só imagem). */
  altText?: string;
  /** Um texto alternativo por mídia, na ordem do carrossel. */
  altTexts?: string[];
  /** Capa do reel: URL própria ou frame do vídeo em milissegundos. */
  coverUrl?: string;
  thumbOffset?: number;
  /** Reels aparecem também no feed por padrão. */
  shareToFeed?: boolean;
};

type ContainerOpts = PublishExtras & {
  imageUrl?: string;
  videoUrl?: string;
  caption?: string;
  mediaType?: "REELS" | "STORIES";
  /** Item de carrossel: não recebe legenda nem extras, só a mídia. */
  isCarouselItem?: boolean;
};

/** Cria um container de mídia (foto, vídeo/reel, story ou item de carrossel). */
export async function createMediaContainer(igId: string, token: string, opts: ContainerOpts): Promise<string> {
  const body: Record<string, string> = { access_token: token };

  if (opts.videoUrl) {
    // Item de carrossel em vídeo é VIDEO; solto, é REELS (ou STORIES).
    body.media_type = opts.isCarouselItem ? "VIDEO" : opts.mediaType || "REELS";
    body.video_url = opts.videoUrl;
  } else if (opts.imageUrl) {
    if (!opts.isCarouselItem && opts.mediaType === "STORIES") body.media_type = "STORIES";
    body.image_url = opts.imageUrl;
  } else {
    throw new Error("Informe uma imagem ou vídeo para publicar.");
  }

  if (opts.isCarouselItem) {
    body.is_carousel_item = "true";
    if (opts.altText) body.alt_text = opts.altText;
    const data = await graphPost<{ id: string }>(`/${igId}/media`, body);
    return data.id;
  }

  if (opts.caption) body.caption = opts.caption;
  applyExtras(body, opts, { isStory: opts.mediaType === "STORIES", isVideo: Boolean(opts.videoUrl) });

  const data = await graphPost<{ id: string }>(`/${igId}/media`, body);
  return data.id;
}

/**
 * Aplica os extras respeitando onde cada um vale: story não aceita legenda,
 * colaborador nem marcação, e capa/`share_to_feed` só fazem sentido em vídeo.
 * Mandar um campo fora de contexto derruba a criação do container inteiro.
 */
function applyExtras(body: Record<string, string>, extras: PublishExtras, ctx: { isStory: boolean; isVideo: boolean }) {
  if (ctx.isStory) return;
  if (extras.locationId) body.location_id = extras.locationId;
  if (extras.collaborators?.length) body.collaborators = JSON.stringify(extras.collaborators);
  if (extras.userTags?.length && !ctx.isVideo) {
    body.user_tags = JSON.stringify(
      extras.userTags.map((t) => ({ username: t.username, x: t.x ?? 0.5, y: t.y ?? 0.5 }))
    );
  }
  if (extras.altText && !ctx.isVideo) body.alt_text = extras.altText;
  if (ctx.isVideo) {
    if (extras.coverUrl) body.cover_url = extras.coverUrl;
    else if (extras.thumbOffset !== undefined) body.thumb_offset = String(extras.thumbOffset);
    if (extras.shareToFeed === false) body.share_to_feed = "false";
  }
}

/**
 * Cria o container do carrossel a partir dos itens já processados.
 * O Instagram aceita de 2 a 10 itens.
 */
export async function createCarouselContainer(
  igId: string,
  token: string,
  childIds: string[],
  caption?: string,
  extras: PublishExtras = {}
): Promise<string> {
  if (childIds.length < 2) throw new Error("Um carrossel precisa de pelo menos 2 mídias.");
  const body: Record<string, string> = {
    access_token: token,
    media_type: "CAROUSEL",
    children: childIds.slice(0, 10).join(","),
  };
  if (caption) body.caption = caption;
  applyExtras(body, extras, { isStory: false, isVideo: false });
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
  /** FEED | REELS | STORY | AD — separa o que a Meta cobra do que é orgânico. */
  productType: string;
  shortcode: string;
  mediaUrl: string | null;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
  commentsEnabled: boolean;
  /** Itens de um carrossel (vazio nos demais formatos). */
  children: { id: string; mediaType: string; mediaUrl: string | null }[];
};

/** Lista as publicações recentes da conta (dados básicos + curtidas/comentários, que já vêm de graça). */
export async function getRecentMedia(igId: string, token: string, limit = 24): Promise<RecentMedia[]> {
  const data = await graph<{ data?: Array<Record<string, unknown>> }>(`/${igId}/media`, {
    access_token: token,
    fields:
      "id,caption,media_type,media_product_type,shortcode,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,is_comment_enabled,children{id,media_type,media_url,thumbnail_url}",
    limit: String(limit),
  });
  return (data.data ?? []).map((m) => ({
    id: String(m.id ?? ""),
    caption: String(m.caption ?? ""),
    mediaType: String(m.media_type ?? ""),
    productType: String(m.media_product_type ?? ""),
    shortcode: String(m.shortcode ?? ""),
    mediaUrl: (m.media_url as string) ?? (m.thumbnail_url as string) ?? null,
    permalink: String(m.permalink ?? ""),
    timestamp: String(m.timestamp ?? ""),
    likeCount: Number(m.like_count ?? 0),
    commentsCount: Number(m.comments_count ?? 0),
    commentsEnabled: m.is_comment_enabled !== false,
    children: (((m.children as { data?: Array<Record<string, unknown>> })?.data) ?? []).map((child) => ({
      id: String(child.id ?? ""),
      mediaType: String(child.media_type ?? ""),
      mediaUrl: (child.media_url as string) ?? (child.thumbnail_url as string) ?? null,
    })),
  }));
}

export type MediaInsights = {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  views: number;
  interactions: number;
  /** Retenção, em milissegundos — só existe em Reels. */
  avgWatchTime: number;
  totalWatchTime: number;
};

const REELS_METRICS = "ig_reels_avg_watch_time,ig_reels_video_view_total_time";
const BASE_METRICS = "reach,likes,comments,saved,shares,views,total_interactions";

/**
 * Insights reais de uma mídia publicada. Além de alcance e engajamento, traz a
 * retenção quando é Reel — a métrica que diz se o vídeo prende ou perde gente.
 *
 * A lista de métricas aceitas muda por tipo de mídia e a API rejeita a chamada
 * inteira quando uma não se aplica, então caímos para conjuntos menores em vez
 * de perder tudo.
 */
export async function getMediaInsights(mediaId: string, token: string, productType?: string): Promise<MediaInsights> {
  const parse = (data: { data?: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value?: number } }> }): MediaInsights => {
    const out: MediaInsights = { likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, views: 0, interactions: 0, avgWatchTime: 0, totalWatchTime: 0 };
    const map: Record<string, keyof MediaInsights> = {
      likes: "likes",
      comments: "comments",
      shares: "shares",
      saved: "saves",
      reach: "reach",
      views: "views",
      total_interactions: "interactions",
      ig_reels_avg_watch_time: "avgWatchTime",
      ig_reels_video_view_total_time: "totalWatchTime",
    };
    for (const m of data.data ?? []) {
      const key = map[m.name];
      if (key) out[key] = m.total_value?.value ?? m.values?.[m.values.length - 1]?.value ?? 0;
    }
    return out;
  };

  const attempts = [
    ...(productType === "REELS" || productType === undefined ? [`${BASE_METRICS},${REELS_METRICS}`] : []),
    BASE_METRICS,
    "reach,likes,comments,saved,shares",
  ];
  let lastError: unknown;
  for (const metric of attempts) {
    try {
      return parse(await graph(`/${mediaId}/insights`, { access_token: token, metric }));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Falha ao ler insights da mídia.");
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
