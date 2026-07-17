export type PlatformT = "instagram" | "facebook" | "x" | "linkedin" | "tiktok" | "youtube";

export interface PostMetrics {
  likes: number; comments: number; shares: number; saves: number; reach: number; clicks: number;
}

export interface Post {
  id: string;
  workspaceId: string;
  authorId: string | null;
  clientId: string | null;
  caption: string;
  firstComment: string;
  networks: PlatformT[];
  mediaUrls: string[];
  format: string;
  status: "draft" | "scheduled" | "published" | "failed" | "cancelled";
  scheduledAt: string | null;
  publishedAt: string | null;
  labels: string[];
  metrics: PostMetrics;
  version: number;
  createdAt: string;
}

export interface Client {
  id: string; name: string; color: string; industry: string;
  responsible: string; notes: string; status: string;
  accounts?: Account[];
}

export interface Account {
  id: string; clientId: string | null; platform: PlatformT;
  handle: string; displayName: string; followers: number; connected: boolean;
}

export interface MediaItem {
  id: string; folderId: string | null; name: string; url: string; type: string;
  width: number; height: number; sizeKb: number; tags: string[];
  isFavorite: boolean; trashedAt: string | null; createdAt: string;
}

export interface Folder { id: string; name: string; color: string; }

export interface InboxItem {
  id: string; platform: PlatformT; type: "comment" | "message" | "mention";
  authorName: string; authorHandle: string; authorColor: string;
  text: string; postPreview: string; status: "unread" | "read" | "archived";
  isFavorite: boolean; replies: { text: string; at: string; by: string }[];
  createdAt: string;
}

export interface AppNotification {
  id: string; title: string; body: string; kind: "info" | "success" | "warning"; read: boolean; createdAt: string;
}

export interface Member {
  id: string; name: string; email: string; role: "admin" | "editor" | "designer" | "client"; status: string; avatarColor: string;
}

export interface ActivityEntry {
  id: string; actorName: string; actorColor: string; action: string; entity: string; createdAt: string;
}

export interface ApiKeyEntry { id: string; name: string; masked: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string; }
export interface WebhookEntry { id: string; url: string; events: string[]; active: boolean; }

export interface WorkspaceData {
  user: { id: string; name: string; email: string; avatarColor: string };
  workspace: { id: string; name: string; plan: string; color: string; timezone: string };
  members: Member[];
  clients: Client[];
  accounts: Account[];
  notifications: AppNotification[];
  activity: ActivityEntry[];
  apiKeys: ApiKeyEntry[];
  webhooks: WebhookEntry[];
  counts: { scheduled: number; inboxUnread: number; drafts: number };
}
