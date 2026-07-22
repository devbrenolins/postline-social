import { db } from "@/db";
import { posts, socialAccounts, analyticsDaily } from "@/db/schema";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getAccountSnapshot, getMediaInsights } from "@/lib/instagram";

const DEFAULT_TTL_MIN = 30;

/**
 * Sincroniza métricas reais do Instagram para o workspace, de forma econômica:
 * só chama a API para contas/posts cujos dados estão "velhos" (fora do TTL).
 * Assim, abrir Análises mantém os números frescos sem cron nem polling
 * constante. Passe `ttlMinutes: 0` para forçar (ex.: botão "Sincronizar").
 *
 * - Contas: alcance do dia + seguidores → upsert em analytics_daily (histórico).
 * - Posts publicados: insights reais por mídia → posts.metrics.
 */
export async function refreshWorkspaceMetrics(workspaceId: string, ttlMinutes = DEFAULT_TTL_MIN): Promise<void> {
  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.platform, "instagram"),
        eq(socialAccounts.connected, true),
        isNull(socialAccounts.deletedAt)
      )
    );
  const usable = accounts.filter((a) => a.externalId && a.accessToken);
  if (usable.length === 0) return;

  const now = Date.now();
  const ttlMs = ttlMinutes * 60_000;
  const today = new Date().toISOString().slice(0, 10);
  const isFresh = (at: Date | null) => Boolean(at && now - new Date(at).getTime() < ttlMs);
  const tokenByAccount = new Map(usable.map((a) => [a.id, a.accessToken!]));

  // --- Snapshot de conta (seguidores + alcance do dia) ---
  for (const acc of usable) {
    if (isFresh(acc.lastSyncedAt)) continue;
    try {
      const snap = await getAccountSnapshot(acc.externalId!, acc.accessToken!);
      await db
        .insert(analyticsDaily)
        .values({ workspaceId, socialAccountId: acc.id, platform: "instagram", day: today, followers: snap.followers, reach: snap.reach })
        .onConflictDoUpdate({
          target: [analyticsDaily.socialAccountId, analyticsDaily.day],
          set: { followers: snap.followers, reach: snap.reach, updatedAt: new Date() },
        });
      await db
        .update(socialAccounts)
        .set({ followers: snap.followers, avatarUrl: snap.profilePicture ?? acc.avatarUrl, lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(socialAccounts.id, acc.id));
    } catch {
      // Falha de uma conta não interrompe as demais.
    }
  }

  // --- Insights por post publicado (mais recentes primeiro) ---
  const published = await db
    .select()
    .from(posts)
    .where(and(eq(posts.workspaceId, workspaceId), eq(posts.status, "published"), isNotNull(posts.publishedAt), isNull(posts.deletedAt)))
    .orderBy(desc(posts.publishedAt))
    .limit(50);

  for (const post of published) {
    const media = post.externalMedia ?? [];
    if (media.length === 0 || isFresh(post.metricsSyncedAt)) continue;

    const agg = { likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, views: 0, clicks: 0 };
    let ok = false;
    for (const m of media) {
      const token = tokenByAccount.get(m.socialAccountId);
      if (!token) continue;
      try {
        const ins = await getMediaInsights(m.mediaId, token);
        agg.likes += ins.likes;
        agg.comments += ins.comments;
        agg.shares += ins.shares;
        agg.saves += ins.saves;
        agg.reach += ins.reach;
        agg.views += ins.views;
        ok = true;
      } catch {
        // Mídia pode ter sido apagada no Instagram — ignora.
      }
    }
    if (ok) {
      await db.update(posts).set({ metrics: agg, metricsSyncedAt: new Date() }).where(eq(posts.id, post.id));
    }
  }
}
