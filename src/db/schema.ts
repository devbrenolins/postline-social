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
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  Auth & Identity                                                    */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    avatarColor: varchar("avatar_color", { length: 24 }).notNull().default("#AB2F5F"),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)]
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
    plan: varchar("plan", { length: 32 }).notNull().default("pro"),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("accounts_workspace_idx").on(t.workspaceId), index("accounts_client_idx").on(t.clientId)]
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
      .$type<{ likes: number; comments: number; shares: number; saves: number; reach: number; clicks: number }>()
      .default({ likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, clicks: 0 }),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("inbox_workspace_idx").on(t.workspaceId), index("inbox_status_idx").on(t.status)]
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
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").default(""),
    kind: varchar("kind", { length: 24 }).notNull().default("info"), // info | success | warning
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("notifications_workspace_idx").on(t.workspaceId)]
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
    impressions: integer("impressions").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
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
    triggerKeywords: jsonb("trigger_keywords").$type<string[]>().notNull().default([]),
    responseTemplate: text("response_template").notNull(),
    active: boolean("active").notNull().default(true),
    sentCount: integer("sent_count").notNull().default(0),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("direct_automations_workspace_idx").on(t.workspaceId)]
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_generations_workspace_idx").on(t.workspaceId), index("ai_generations_kind_idx").on(t.kind)]
);
