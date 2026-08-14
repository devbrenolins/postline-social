import { db } from "@/db";
import { posts, socialAccounts, analyticsDaily } from "@/db/schema";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import {
  getAccountSnapshot,
  getMediaInsights,
  getAccountDayTotals,
  getAccountDayDetail,
  getAccountReachSeries,
  dayOfPeriod,
} from "@/lib/instagram";

const DEFAULT_TTL_MIN = 30;
/** Janela máxima que a API de insights aceita numa consulta. */
const BACKFILL_DAYS = 30;
/** Teto de chamadas de detalhe por execução (o backfill inteiro cabe em uma). */
const MAX_DETAIL_CALLS = 32;
/** Chamadas simultâneas ao buscar dias fechados. */
const BATCH = 10;

type Account = typeof socialAccounts.$inferSelect;

/**
 * Sincroniza métricas reais do Instagram para o workspace, de forma econômica:
 * só chama a API para contas/posts/dias cujos dados estão "velhos" ou faltando.
 * Assim, abrir Análises mantém os números frescos sem cron nem polling
 * constante. Passe `ttlMinutes: 0` para forçar (ex.: botão "Sincronizar").
 *
 * - Contas: alcance, visualizações e engajamento **por dia** → analytics_daily.
 * - Posts publicados pelo app: insights reais por mídia → posts.metrics.
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

  const ttlMs = ttlMinutes * 60_000;

  for (const acc of usable) {
    try {
      await syncAccountDays(workspaceId, acc, ttlMs);
    } catch {
      // Falha de uma conta não interrompe as demais.
    }
  }

  await syncPublishedPosts(workspaceId, usable, ttlMs);
}

/**
 * Preenche `analytics_daily` com o histórico diário da conta.
 *
 * O alcance vem em série temporal (uma chamada cobre 30 dias), mas
 * visualizações, curtidas, comentários, compartilhamentos e salvamentos só
 * existem como `total_value` — uma chamada por dia. Por isso só buscamos os
 * dias que faltam ou que foram gravados **antes** do dia fechar: um dia já
 * completo nunca é buscado de novo.
 */
async function syncAccountDays(workspaceId: string, acc: Account, ttlMs: number): Promise<void> {
  const igId = acc.externalId!;
  const token = acc.accessToken!;
  const now = Date.now();

  // Sincronizou há pouco: nem a série precisa ser pedida. `lastSyncedAt` é
  // gravado ao fim de cada passada, então cobre backfill e dia corrente.
  if (ttlMs > 0 && acc.lastSyncedAt && now - new Date(acc.lastSyncedAt).getTime() < ttlMs) return;

  // Série de alcance: histórico + as fronteiras de dia do fuso do perfil.
  let series: Array<{ day: string; endTime: number; reach: number }> = [];
  try {
    series = await getAccountReachSeries(igId, token, BACKFILL_DAYS);
  } catch {
    // Sem série ainda dá para gravar o dia corrente.
  }

  const rows = await db
    .select({ day: analyticsDaily.day, updatedAt: analyticsDaily.updatedAt })
    .from(analyticsDaily)
    .where(and(eq(analyticsDaily.socialAccountId, acc.id), isNull(analyticsDaily.deletedAt)));
  const syncedAt = new Map(rows.map((r) => [String(r.day), new Date(r.updatedAt).getTime()]));

  // Um dia fechado só precisa de nova busca se nunca foi gravado ou se foi
  // gravado enquanto ainda estava correndo (números parciais).
  const pending = series
    .filter((d) => {
      const at = syncedAt.get(d.day);
      return at === undefined || at < d.endTime * 1000;
    })
    .slice(-MAX_DETAIL_CALLS);

  const filled: Array<DayValues & { day: string }> = [];
  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);
    const details = await Promise.all(
      slice.map(async (d) => ({ d, totals: await getAccountDayDetail(igId, token, d.endTime) }))
    );
    for (const { d, totals } of details) {
      filled.push({
        day: d.day,
        // Se o detalhe do dia falhar, ao menos o alcance da série entra.
        reach: totals.reach || d.reach,
        views: totals.views,
        likes: totals.likes,
        comments: totals.comments,
        shares: totals.shares,
        saves: totals.saves,
      });
    }
  }
  if (filled.length > 0) await upsertDays(workspaceId, acc.id, filled);

  // Dia corrente: números parciais, revisitados a cada TTL.
  const lastEnd = series[series.length - 1]?.endTime;
  const todayKey = lastEnd ? dayOfPeriod(lastEnd + 86_400) : new Date().toISOString().slice(0, 10);
  const todayAt = syncedAt.get(todayKey);
  const todayFresh = todayAt !== undefined && now - todayAt < ttlMs;

  if (!todayFresh) {
    const [snap, totals] = await Promise.all([
      getAccountSnapshot(igId, token).catch(() => null),
      getAccountDayTotals(igId, token),
    ]);
    await upsertDay(workspaceId, acc.id, todayKey, {
      reach: totals.reach,
      views: totals.views,
      likes: totals.likes,
      comments: totals.comments,
      shares: totals.shares,
      saves: totals.saves,
      // Seguidores só existem "de hoje": a API não devolve o total histórico,
      // e nos dias preenchidos pelo backfill o campo fica 0 de propósito.
      followers: snap?.followers ?? acc.followers,
    });
    if (snap) {
      await db
        .update(socialAccounts)
        .set({
          followers: snap.followers,
          avatarUrl: snap.profilePicture ?? acc.avatarUrl,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, acc.id));
    }
  }
}

type DayValues = {
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

/** Grava o dia corrente, único momento em que o total de seguidores é conhecido. */
async function upsertDay(workspaceId: string, socialAccountId: string, day: string, v: DayValues & { followers: number }) {
  const set = {
    reach: v.reach,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    shares: v.shares,
    saves: v.saves,
    followers: v.followers,
    updatedAt: new Date(),
  };
  await db
    .insert(analyticsDaily)
    .values({ workspaceId, socialAccountId, platform: "instagram", day, ...set })
    .onConflictDoUpdate({ target: [analyticsDaily.socialAccountId, analyticsDaily.day], set });
}

/**
 * Grava os dias fechados de uma vez só — 30 ida-e-voltas ao banco no backfill
 * inicial custavam mais que as próprias chamadas à Meta.
 * `followers` fica de fora: o histórico não vem da API e não pode ser
 * sobrescrito com o número de hoje.
 */
async function upsertDays(workspaceId: string, socialAccountId: string, rows: Array<DayValues & { day: string }>) {
  await db
    .insert(analyticsDaily)
    .values(rows.map((r) => ({ workspaceId, socialAccountId, platform: "instagram" as const, ...r })))
    .onConflictDoUpdate({
      target: [analyticsDaily.socialAccountId, analyticsDaily.day],
      set: {
        reach: sql`excluded.reach`,
        views: sql`excluded.views`,
        likes: sql`excluded.likes`,
        comments: sql`excluded.comments`,
        shares: sql`excluded.shares`,
        saves: sql`excluded.saves`,
        updatedAt: new Date(),
      },
    });
}

/** Insights reais por mídia dos posts publicados pelo próprio Postline. */
async function syncPublishedPosts(workspaceId: string, accounts: Account[], ttlMs: number): Promise<void> {
  const now = Date.now();
  const tokenByAccount = new Map(accounts.map((a) => [a.id, a.accessToken!]));
  const since = new Date(now - BACKFILL_DAYS * 86_400_000);

  const published = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.workspaceId, workspaceId),
        eq(posts.status, "published"),
        isNotNull(posts.publishedAt),
        isNull(posts.deletedAt),
        gte(posts.publishedAt, since)
      )
    )
    .orderBy(desc(posts.publishedAt))
    .limit(50);

  for (const post of published) {
    const media = post.externalMedia ?? [];
    const fresh = post.metricsSyncedAt && now - new Date(post.metricsSyncedAt).getTime() < ttlMs;
    if (media.length === 0 || fresh) continue;

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
