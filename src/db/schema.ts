import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  bigint,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  date,
  numeric,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  Auth & Identity                                                    */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Vincula ao usuário do Supabase Auth (auth.users.id). Nulo apenas em contas legadas.
    authId: uuid("auth_id"),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    // Nulo quando a autenticação é gerida pelo Supabase (senha vive no Supabase Auth).
    passwordHash: text("password_hash"),
    avatarUrl: text("avatar_url"),
    avatarColor: varchar("avatar_color", { length: 24 }).notNull().default("#AB2F5F"),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), uniqueIndex("users_auth_id_idx").on(t.authId)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: varchar("token", { length: 128 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("sessions_token_idx").on(t.token), index("sessions_user_idx").on(t.userId)]
);

/* ------------------------------------------------------------------ */
/*  Workspaces & Team                                                  */
/* ------------------------------------------------------------------ */

export type MemberRole = "admin" | "editor" | "designer" | "client";

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    color: varchar("color", { length: 24 }).notNull().default("#AB2F5F"),
    plan: varchar("plan", { length: 32 }).notNull().default("trial"),
    // Fim do teste gratuito. Nulo em planos pagos.
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    timezone: varchar("timezone", { length: 64 }).notNull().default("America/Sao_Paulo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("workspaces_slug_idx").on(t.slug)]
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    invitedEmail: varchar("invited_email", { length: 320 }),
    role: varchar("role", { length: 24 }).$type<MemberRole>().notNull().default("editor"),
    status: varchar("status", { length: 24 }).notNull().default("active"), // active | pending
    avatarColor: varchar("avatar_color", { length: 24 }).default("#3E6C8E"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("members_workspace_idx").on(t.workspaceId), index("members_user_idx").on(t.userId)]
);

/* ------------------------------------------------------------------ */
/*  Clients (brands managed by the agency)                             */
/* ------------------------------------------------------------------ */

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    industry: varchar("industry", { length: 120 }).default(""),
    color: varchar("color", { length: 24 }).notNull().default("#3E6C8E"),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    notes: text("notes").default(""),
    responsible: varchar("responsible", { length: 160 }).default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("clients_workspace_idx").on(t.workspaceId)]
);

/* ------------------------------------------------------------------ */
/*  Social accounts                                                    */
/* ------------------------------------------------------------------ */

export type Platform = "instagram" | "facebook" | "x" | "linkedin" | "tiktok" | "youtube";

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    platform: varchar("platform", { length: 24 }).$type<Platform>().notNull(),
    handle: varchar("handle", { length: 120 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    followers: integer("followers").notNull().default(0),
    connected: boolean("connected").notNull().default(true),
    // Integração oficial (Instagram Graph API / Meta)
    provider: varchar("provider", { length: 24 }).default("meta"), // meta | manual
    externalId: varchar("external_id", { length: 64 }), // IG Business account id
    /**
     * ID app-scoped da conta — o "ID do usuário" que aparece no app do
     * Instagram. É diferente do `external_id` e é o que a Meta pode mandar no
     * `entry.id` do webhook; sem ele o evento não casa com conta nenhuma e é
     * descartado em silêncio.
     */
    appScopedId: varchar("app_scoped_id", { length: 80 }),
    pageId: varchar("page_id", { length: 64 }), // Facebook Page vinculada
    avatarUrl: text("avatar_url"),
    accessToken: text("access_token"), // long-lived token da conta/página
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: jsonb("scopes").$type<string[]>().default([]),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("accounts_workspace_idx").on(t.workspaceId),
    index("accounts_client_idx").on(t.clientId),
    uniqueIndex("accounts_external_idx").on(t.workspaceId, t.externalId),
  ]
);

/* ------------------------------------------------------------------ */
/*  Media library                                                      */
/* ------------------------------------------------------------------ */

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    color: varchar("color", { length: 24 }).default("#8A8FA3"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("folders_workspace_idx").on(t.workspaceId)]
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    url: text("url").notNull(),
    type: varchar("type", { length: 16 }).notNull().default("image"), // image | video | gif | pdf
    width: integer("width").default(1080),
    height: integer("height").default(1080),
    sizeKb: integer("size_kb").default(420),
    tags: jsonb("tags").$type<string[]>().default([]),
    isFavorite: boolean("is_favorite").notNull().default(false),
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("media_workspace_idx").on(t.workspaceId), index("media_folder_idx").on(t.folderId)]
);

/* ------------------------------------------------------------------ */
/*  Posts (drafts, scheduled, published — unified)                     */
/* ------------------------------------------------------------------ */

export type PostStatus = "draft" | "scheduled" | "published" | "failed" | "cancelled";

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    caption: text("caption").notNull().default(""),
    firstComment: text("first_comment").default(""),
    networks: jsonb("networks").$type<Platform[]>().notNull().default([]),
    mediaUrls: jsonb("media_urls").$type<string[]>().notNull().default([]),
    format: varchar("format", { length: 24 }).notNull().default("feed"), // feed | carousel | story | reel | short | pdf
    status: varchar("status", { length: 24 }).$type<PostStatus>().notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    labels: jsonb("labels").$type<string[]>().default([]),
    metrics: jsonb("metrics")
      .$type<{
        likes: number;
        comments: number;
        shares: number;
        saves: number;
        reach: number;
        views: number;
        clicks: number;
        /** Interações totais somadas pela própria Meta. */
        interactions?: number;
        /** Só em Reels: tempo médio assistido e tempo total, em milissegundos. */
        avgWatchTime?: number;
        totalWatchTime?: number;
      }>()
      .default({ likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, views: 0, clicks: 0 }),
    /** Extras aceitos pela API na hora de publicar (local, colaboradores, tags…). */
    publishOptions: jsonb("publish_options")
      .$type<{
        locationId?: string;
        collaborators?: string[];
        userTags?: { username: string; x?: number; y?: number }[];
        altTexts?: string[];
        coverUrl?: string;
        thumbOffset?: number;
        shareToFeed?: boolean;
      }>()
      .default({}),
    // IDs de mídia no Instagram por conta (para buscar insights reais do post).
    externalMedia: jsonb("external_media")
      .$type<{ socialAccountId: string; mediaId: string }[]>()
      .default([]),
    // Última vez que as métricas deste post foram sincronizadas da API.
    metricsSyncedAt: timestamp("metrics_synced_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    history: jsonb("history").$type<{ caption: string; at: string }[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("posts_workspace_idx").on(t.workspaceId),
    index("posts_status_idx").on(t.status),
    index("posts_scheduled_idx").on(t.scheduledAt),
  ]
);

/* ------------------------------------------------------------------ */
/*  Inbox (comments, messages, mentions — unified)                     */
/* ------------------------------------------------------------------ */

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 24 }).$type<Platform>().notNull(),
    type: varchar("type", { length: 24 }).notNull().default("comment"), // comment | message | mention
    authorName: varchar("author_name", { length: 160 }).notNull(),
    authorHandle: varchar("author_handle", { length: 160 }).notNull(),
    authorColor: varchar("author_color", { length: 24 }).notNull().default("#3E6C8E"),
    text: text("text").notNull().default(""),
    postPreview: text("post_preview").default(""),
    status: varchar("status", { length: 24 }).notNull().default("unread"), // unread | read | archived
    isFavorite: boolean("is_favorite").notNull().default(false),
    replies: jsonb("replies").$type<{ text: string; at: string; by: string }[]>().default([]),
    /** Conta que recebeu — é dela o token usado para responder. */
    socialAccountId: uuid("social_account_id").references(() => socialAccounts.id, { onDelete: "set null" }),
    /** ID do comentário (ou do remetente, em mensagem) no Instagram. */
    externalId: varchar("external_id", { length: 80 }),
    /** Mídia comentada, para abrir o post e casar com a automação. */
    externalMediaId: varchar("external_media_id", { length: 80 }),
    permalink: text("permalink"),
    /** Comentário ocultado no Instagram (some para os outros, não é apagado). */
    hidden: boolean("hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("inbox_workspace_idx").on(t.workspaceId),
    index("inbox_status_idx").on(t.status),
    // Reimportar a mesma conversa não pode duplicar a caixa de entrada.
    uniqueIndex("inbox_external_idx").on(t.workspaceId, t.externalId),
  ]
);

/* ------------------------------------------------------------------ */
/*  Notifications                                                      */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Destinatário. Nulo = visível para o workspace inteiro (comportamento antigo);
    // preenchido = only-me, usado por avisos como "seu post agendado publicou".
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").default(""),
    kind: varchar("kind", { length: 24 }).notNull().default("info"), // info | success | warning
    // Link aberto ao tocar na notificação push.
    url: text("url"),
    read: boolean("read").notNull().default(false),
    // Idempotência para avisos recorrentes: o cron roda de hora em hora e tentaria
    // reinserir "seu teste acaba em 3 dias" toda vez. Com o índice único abaixo, a
    // segunda inserção é descartada (onConflictDoNothing) em vez de virar spam.
    dedupeKey: varchar("dedupe_key", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("notifications_workspace_idx").on(t.workspaceId),
    index("notifications_user_idx").on(t.userId),
    uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey),
  ]
);

/* ------------------------------------------------------------------ */
/*  Web Push (uma linha por dispositivo/navegador inscrito)            */
/* ------------------------------------------------------------------ */

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // O endpoint identifica o dispositivo e é a chave natural: o mesmo navegador
    // reinscrevendo devolve o mesmo endpoint, então atualizamos em vez de duplicar.
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    // Última vez que um envio a este endpoint teve sucesso — só para diagnóstico.
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_endpoint_idx").on(t.endpoint), index("push_user_idx").on(t.userId)]
);

/* ------------------------------------------------------------------ */
/*  Analytics (daily rollup per social account)                        */
/* ------------------------------------------------------------------ */

export const analyticsDaily = pgTable(
  "analytics_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 24 }).$type<Platform>().notNull(),
    day: date("day").notNull(),
    followers: integer("followers").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    /** Visualizações do dia (métrica `views` da conta: posts + reels + stories). */
    views: integer("views").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    /** Visitas ao perfil no dia. */
    profileViews: integer("profile_views").notNull().default(0),
    /** Cliques no link da bio. */
    websiteClicks: integer("website_clicks").notNull().default(0),
    /** Contas únicas que interagiram com o conteúdo. */
    accountsEngaged: integer("accounts_engaged").notNull().default(0),
    /** Interações totais (curtidas + comentários + salvos + compart. + respostas). */
    totalInteractions: integer("total_interactions").notNull().default(0),
    /** Respostas a stories. */
    replies: integer("replies").notNull().default(0),
    /** Ganho líquido de seguidores no dia (métrica `follower_count`). */
    followerDelta: integer("follower_delta").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("analytics_account_day_idx").on(t.socialAccountId, t.day),
    index("analytics_workspace_idx").on(t.workspaceId),
    index("analytics_day_idx").on(t.day),
  ]
);

/**
 * Recortes das métricas diárias e da audiência.
 *
 * Uma linha por (dia, métrica, dimensão, rótulo) — formato longo de propósito:
 * a Meta devolve dimensões com cardinalidade variável (tipo de mídia, seguidor
 * vs. não seguidor, cidade, faixa etária) e novas aparecem sem aviso. Somar por
 * período vira um `GROUP BY`, sem precisar de coluna nova a cada recorte.
 */
export const analyticsBreakdowns = pgTable(
  "analytics_breakdowns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 24 }).$type<Platform>().notNull(),
    day: date("day").notNull(),
    /** views | reach | followers | reached */
    metric: varchar("metric", { length: 40 }).notNull(),
    /** follow_type | media_product_type | city | country | age | gender */
    dimension: varchar("dimension", { length: 40 }).notNull(),
    /** FOLLOWER, REEL, "São Paulo, São Paulo (state)", "25-34", F… */
    label: varchar("label", { length: 160 }).notNull(),
    value: integer("value").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("breakdown_unique_idx").on(t.socialAccountId, t.day, t.metric, t.dimension, t.label),
    index("breakdown_workspace_day_idx").on(t.workspaceId, t.day),
  ]
);

/* ------------------------------------------------------------------ */
/*  Audit, API & Integrations                                          */
/* ------------------------------------------------------------------ */

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    actorName: varchar("actor_name", { length: 160 }).notNull().default("Sistema"),
    actorColor: varchar("actor_color", { length: 24 }).default("#8A8FA3"),
    action: varchar("action", { length: 160 }).notNull(),
    entity: varchar("entity", { length: 60 }).notNull().default(""),
    entityId: varchar("entity_id", { length: 80 }).default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("activity_workspace_idx").on(t.workspaceId)]
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    prefix: varchar("prefix", { length: 16 }).notNull(),
    key: varchar("key", { length: 96 }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("api_keys_workspace_idx").on(t.workspaceId)]
);

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    events: jsonb("events").$type<string[]>().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("webhooks_workspace_idx").on(t.workspaceId)]
);

/* ------------------------------------------------------------------ */
/*  AI studio, competitor tracking & direct automation                */
/* ------------------------------------------------------------------ */

export const directAutomations = pgTable(
  "direct_automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    platform: varchar("platform", { length: 24 }).$type<Platform>().notNull().default("instagram"),
    // Quando preenchido, a regra só vale para comentários daquela publicação.
    // Nulo = vale para qualquer direct do workspace (comportamento original).
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    triggerKeywords: jsonb("trigger_keywords").$type<string[]>().notNull().default([]),
    responseTemplate: text("response_template").notNull(),
    active: boolean("active").notNull().default(true),
    sentCount: integer("sent_count").notNull().default(0),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("direct_automations_workspace_idx").on(t.workspaceId), index("direct_automations_post_idx").on(t.postId)]
);

export const competitors = pgTable(
  "competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    handle: varchar("handle", { length: 160 }).notNull(),
    platform: varchar("platform", { length: 24 }).$type<Platform>().notNull().default("instagram"),
    active: boolean("active").notNull().default(true),
    lastAnalysis: text("last_analysis"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("competitors_workspace_idx").on(t.workspaceId)]
);

export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    prompt: text("prompt").notNull(),
    resultText: text("result_text"),
    model: varchar("model", { length: 80 }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_generations_workspace_idx").on(t.workspaceId), index("ai_generations_kind_idx").on(t.kind)]
);

/* ------------------------------------------------------------------ */
/*  Planos e créditos                                                  */
/* ------------------------------------------------------------------ */

/**
 * Compras de pacotes de crédito.
 *
 * O checkout é simulado enquanto não há provedor de pagamento: a compra nasce
 * `pending` e é confirmada pela própria aplicação. `provider` e `externalId`
 * já existem para o dia em que um provedor real entrar, sem migração nova.
 */
export const creditPurchases = pgTable(
  "credit_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    packId: varchar("pack_id", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 24 }).notNull(),
    credits: numeric("credits", { precision: 12, scale: 3 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("BRL"),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    provider: varchar("provider", { length: 32 }).notNull().default("simulado"),
    externalId: varchar("external_id", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("credit_purchases_workspace_idx").on(t.workspaceId)]
);

/**
 * Razão de créditos avulsos: entradas positivas vêm de compra, negativas de
 * consumo que passou do saldo diário do plano. O saldo é a soma das linhas —
 * assim o histórico fica auditável em vez de virar um contador solto.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 24 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 3 }).notNull(),
    reason: varchar("reason", { length: 64 }).notNull(),
    purchaseId: uuid("purchase_id").references(() => creditPurchases.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("credit_ledger_workspace_idx").on(t.workspaceId, t.kind)]
);
