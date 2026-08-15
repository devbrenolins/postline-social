import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import {
  getRecentMedia,
  getMediaInsights,
  getActiveStories,
  getTaggedMedia,
  getPublishingLimit,
  getAccountProfile,
  type StoryItem,
  type TaggedMedia,
} from "@/lib/instagram";
import { and, eq, isNull } from "drizzle-orm";

export type IgMedia = {
  id: string;
  account: string;
  caption: string;
  mediaType: string;
  /** FEED | REELS | STORY | AD — o que a Meta considera cada publicação. */
  productType: string;
  shortcode: string;
  mediaUrl: string | null;
  permalink: string;
  timestamp: string;
  likes: number;
  comments: number;
  reach: number;
  saves: number;
  shares: number;
  views: number;
  interactions: number;
  /** Retenção em milissegundos — só Reels devolvem. */
  avgWatchTime: number;
  totalWatchTime: number;
  commentsEnabled: boolean;
  /** Itens do carrossel, quando houver. */
  children: { id: string; mediaType: string; mediaUrl: string | null }[];
};

export type WorkspaceMedia = { media: IgMedia[]; fetchedAt: string; cached: boolean; noAccount: boolean };

// Cache best-effort por workspace, para não chamar a API a cada abertura.
// Some no cold start do serverless — é só uma economia, não fonte de verdade.
const cache = new Map<string, { at: number; media: IgMedia[] }>();
const TTL_MS = 10 * 60 * 1000;

/**
 * Publicações que a conta já tem no Instagram + engajamento real (alcance,
 * curtidas, comentários, salvos, compartilhamentos, views).
 *
 * Nada é "importado": é sempre buscado sob demanda. É a única fonte que
 * enxerga o que foi postado **fora** do Postline — a tabela `posts` só conhece
 * o que o próprio app publicou.
 */
export async function getWorkspaceMedia(
  workspaceId: string,
  opts: { force?: boolean; limit?: number } = {}
): Promise<WorkspaceMedia> {
  const cached = cache.get(workspaceId);
  if (!opts.force && cached && Date.now() - cached.at < TTL_MS) {
    return { media: cached.media, fetchedAt: new Date(cached.at).toISOString(), cached: true, noAccount: false };
  }

  const accounts = (
    await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, workspaceId),
          eq(socialAccounts.platform, "instagram"),
          eq(socialAccounts.connected, true),
          isNull(socialAccounts.deletedAt)
        )
      )
  ).filter((a) => a.externalId && a.accessToken);

  if (accounts.length === 0) {
    return { media: [], fetchedAt: new Date().toISOString(), cached: false, noAccount: true };
  }

  const media: IgMedia[] = [];
  for (const acc of accounts) {
    try {
      const recent = await getRecentMedia(acc.externalId!, acc.accessToken!, opts.limit ?? 24);
      const withInsights = await Promise.all(
        recent.map(async (m) => {
          const base: IgMedia = {
            id: m.id,
            account: acc.handle,
            caption: m.caption,
            mediaType: m.mediaType,
            productType: m.productType,
            shortcode: m.shortcode,
            mediaUrl: m.mediaUrl,
            permalink: m.permalink,
            timestamp: m.timestamp,
            likes: m.likeCount,
            comments: m.commentsCount,
            reach: 0,
            saves: 0,
            shares: 0,
            views: 0,
            interactions: 0,
            avgWatchTime: 0,
            totalWatchTime: 0,
            commentsEnabled: m.commentsEnabled,
            children: m.children,
          };
          try {
            const ins = await getMediaInsights(m.id, acc.accessToken!, m.productType);
            return {
              ...base,
              reach: ins.reach,
              saves: ins.saves,
              shares: ins.shares,
              views: ins.views,
              interactions: ins.interactions,
              avgWatchTime: ins.avgWatchTime,
              totalWatchTime: ins.totalWatchTime,
              likes: ins.likes || m.likeCount,
              comments: ins.comments || m.commentsCount,
            };
          } catch {
            return base; // mídia sem insights (muito antiga/indisponível) — mantém likes/comments
          }
        })
      );
      media.push(...withInsights);
    } catch {
      // Falha em uma conta não derruba as demais.
    }
  }

  media.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const at = Date.now();
  cache.set(workspaceId, { at, media });
  return { media, fetchedAt: new Date(at).toISOString(), cached: false, noAccount: false };
}

export type WorkspaceOverview = {
  profile: {
    handle: string;
    accountType: string;
    biography: string;
    website: string;
    followers: number;
    follows: number;
    mediaCount: number;
  } | null;
  stories: StoryItem[];
  tagged: TaggedMedia[];
  /** Cota de publicação das últimas 24h. */
  quota: { used: number; total: number };
};

const overviewCache = new Map<string, { at: number; data: WorkspaceOverview }>();

/**
 * Retrato da conta que não cabe na listagem de publicações: stories no ar
 * (a Meta só guarda 24h), marcações de terceiros, cota de publicação e os
 * campos de perfil que o app não lia (bio, site, quantos o perfil segue).
 *
 * Fica separado de `getWorkspaceMedia` de propósito: são mais 3 chamadas que a
 * tela de Análises não precisa pagar.
 */
export async function getWorkspaceOverview(workspaceId: string, opts: { force?: boolean } = {}): Promise<WorkspaceOverview> {
  const cached = overviewCache.get(workspaceId);
  if (!opts.force && cached && Date.now() - cached.at < TTL_MS) return cached.data;

  const empty: WorkspaceOverview = { profile: null, stories: [], tagged: [], quota: { used: 0, total: 100 } };
  const account = (
    await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, workspaceId),
          eq(socialAccounts.platform, "instagram"),
          eq(socialAccounts.connected, true),
          isNull(socialAccounts.deletedAt)
        )
      )
      .limit(1)
  ).find((a) => a.externalId && a.accessToken);
  if (!account) return empty;

  const igId = account.externalId!;
  const token = account.accessToken!;
  const [profile, stories, tagged, quota] = await Promise.all([
    getAccountProfile(igId, token).catch(() => null),
    getActiveStories(igId, token).catch(() => []),
    getTaggedMedia(igId, token).catch(() => []),
    getPublishingLimit(igId, token),
  ]);

  const data: WorkspaceOverview = {
    profile: profile
      ? {
          handle: profile.username ?? account.handle,
          accountType: profile.account_type ?? "",
          biography: profile.biography ?? "",
          website: profile.website ?? "",
          followers: profile.followers_count ?? account.followers,
          follows: profile.follows_count ?? 0,
          mediaCount: profile.media_count ?? 0,
        }
      : null,
    stories,
    tagged,
    quota,
  };
  overviewCache.set(workspaceId, { at: Date.now(), data });
  return data;
}
