import { db } from "@/db";
import { posts, socialAccounts, analyticsDaily, analyticsBreakdowns } from "@/db/schema";
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  getAccountSnapshot,
  getMediaInsights,
  getAccountDayTotals,
  getAccountDayDetail,
  getAccountReachSeries,
  getAccountDayBreakdown,
  getFollowerDeltaSeries,
  getAudienceDemographics,
  dayOfPeriod,
  type Breakdown,
} from "@/lib/instagram";

const DEFAULT_TTL_MIN = 30;
/** Janela máxima que a API de insights aceita numa consulta. */
const BACKFILL_DAYS = 30;
/**
 * Orçamento de chamadas à Meta por execução.
 *
 * Cada dia fechado custa 1 chamada de totais + 2 de recorte (seguidor vs. não
 * seguidor, tipo de mídia) — 30 dias não cabem numa requisição só sem estourar
 * o limite de tempo da rota. O backfill então avança por partes: os dias que
 * sobrarem ficam pendentes e a próxima abertura continua de onde parou.
 */
const CALL_BUDGET = 60;
/** Dias processados em paralelo (cada um dispara até 3 chamadas). */
const BATCH = 4;
/** Demografia é `lifetime` e muda devagar — uma vez por dia basta. */
const DEMOGRAPHICS_TTL_MS = 24 * 60 * 60 * 1000;

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

  // Sincronizou há pouco e sem pendências: nem a série precisa ser pedida.
  // `lastSyncedAt` só é gravado quando a passada termina inteira, então um
  // backfill interrompido pelo orçamento não fica travado atrás do TTL.
  if (ttlMs > 0 && acc.lastSyncedAt && now - new Date(acc.lastSyncedAt).getTime() < ttlMs) return;

  let budget = CALL_BUDGET;
  const spend = (n: number) => {
    budget -= n;
    return budget >= 0;
  };

  // Série de alcance: histórico + as fronteiras de dia do fuso do perfil.
  let series: Array<{ day: string; endTime: number; reach: number }> = [];
  try {
    spend(1);
    series = await getAccountReachSeries(igId, token, BACKFILL_DAYS);
  } catch {
    // Sem série ainda dá para gravar o dia corrente.
  }

  // Ganho de seguidores por dia: uma chamada cobre a janela toda.
  spend(1);
  const followerDeltas = await getFollowerDeltaSeries(igId, token, BACKFILL_DAYS);

  const rows = await db
    .select({ day: analyticsDaily.day, updatedAt: analyticsDaily.updatedAt })
    .from(analyticsDaily)
    .where(and(eq(analyticsDaily.socialAccountId, acc.id), isNull(analyticsDaily.deletedAt)));
  const syncedAt = new Map(rows.map((r) => [String(r.day), new Date(r.updatedAt).getTime()]));

  // Um dia fechado só precisa de nova busca se nunca foi gravado ou se foi
  // gravado enquanto ainda estava correndo (números parciais). Do mais recente
  // para o mais antigo: se o orçamento acabar, o que fica de fora é o passado.
  const pending = series
    .filter((d) => {
      const at = syncedAt.get(d.day);
      return at === undefined || at < d.endTime * 1000;
    })
    .reverse();

  const filled: Array<DayValues & { day: string }> = [];
  const breakdownRows: BreakdownRow[] = [];
  let exhausted = false;

  for (let i = 0; i < pending.length && !exhausted; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);
    // Recorte só onde houve movimento: dia sem alcance tem recorte todo zero.
    const cost = slice.reduce((sum, d) => sum + 1 + (d.reach > 0 ? 2 : 0), 0);
    if (!spend(cost)) {
      exhausted = true;
      break;
    }

    const done = await Promise.all(
      slice.map(async (d) => {
        const [totals, follow, product] = await Promise.all([
          getAccountDayDetail(igId, token, d.endTime),
          d.reach > 0 ? getAccountDayBreakdown(igId, token, d.endTime, "follow_type") : Promise.resolve({}),
          d.reach > 0 ? getAccountDayBreakdown(igId, token, d.endTime, "media_product_type") : Promise.resolve({}),
        ]);
        return { d, totals, cuts: [follow, product] };
      })
    );

    for (const { d, totals, cuts } of done) {
      filled.push({
        day: d.day,
        // Se o detalhe do dia falhar, ao menos o alcance da série entra.
        reach: totals.reach || d.reach,
        views: totals.views,
        likes: totals.likes,
        comments: totals.comments,
        shares: totals.shares,
        saves: totals.saves,
        profileViews: totals.profile_views,
        websiteClicks: totals.website_clicks,
        accountsEngaged: totals.accounts_engaged,
        totalInteractions: totals.total_interactions,
        replies: totals.replies,
        followerDelta: followerDeltas.get(d.day) ?? 0,
      });
      for (const cut of cuts) {
        for (const [metric, entries] of Object.entries(cut)) {
          for (const entry of entries as Breakdown[]) {
            breakdownRows.push({ day: d.day, metric, dimension: entry.dimension, label: entry.label, value: entry.value });
          }
        }
      }
    }
  }

  if (filled.length > 0) await upsertDays(workspaceId, acc.id, filled);
  if (breakdownRows.length > 0) await upsertBreakdowns(workspaceId, acc.id, breakdownRows);

  // Dia corrente: números parciais, revisitados a cada TTL.
  const lastEnd = series[series.length - 1]?.endTime;
  const todayKey = lastEnd ? dayOfPeriod(lastEnd + 86_400) : new Date().toISOString().slice(0, 10);
  const todayAt = syncedAt.get(todayKey);
  const todayFresh = todayAt !== undefined && now - todayAt < ttlMs;

  if (!todayFresh && budget > 0) {
    spend(2);
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
      profileViews: totals.profile_views,
      websiteClicks: totals.website_clicks,
      accountsEngaged: totals.accounts_engaged,
      totalInteractions: totals.total_interactions,
      replies: totals.replies,
      followerDelta: followerDeltas.get(todayKey) ?? 0,
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
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, acc.id));
    }
  }

  await syncDemographics(workspaceId, acc, todayKey);

  // Só declara a conta em dia quando não sobrou pendência: assim a próxima
  // abertura retoma o backfill em vez de esbarrar no TTL.
  if (!exhausted) {
    await db.update(socialAccounts).set({ lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(socialAccounts.id, acc.id));
  }
}

/**
 * Perfil da audiência (cidade, país, idade, gênero) de quem segue e de quem foi
 * alcançado. Fica fora do orçamento do backfill: são 8 chamadas no máximo, uma
 * vez por dia — se disputasse com os dias fechados, nunca sobraria vez.
 */
async function syncDemographics(workspaceId: string, acc: Account, day: string): Promise<void> {
  const last = await db
    .select({ at: analyticsBreakdowns.updatedAt })
    .from(analyticsBreakdowns)
    .where(and(eq(analyticsBreakdowns.socialAccountId, acc.id), inArray(analyticsBreakdowns.metric, ["followers", "reached"])))
    .orderBy(desc(analyticsBreakdowns.updatedAt))
    .limit(1);
  if (last[0] && Date.now() - new Date(last[0].at).getTime() < DEMOGRAPHICS_TTL_MS) return;

  const demographics = await getAudienceDemographics(acc.externalId!, acc.accessToken!);
  if (demographics.length === 0) return;
  await upsertBreakdowns(
    workspaceId,
    acc.id,
    demographics.map((d) => ({ day, metric: d.metric, dimension: d.dimension, label: d.label, value: d.value }))
  );
}

type BreakdownRow = { day: string; metric: string; dimension: string; label: string; value: number };

async function upsertBreakdowns(workspaceId: string, socialAccountId: string, rows: BreakdownRow[]) {
  // A mesma chave pode repetir dentro do lote quando a Meta devolve rótulos
  // duplicados; o Postgres recusa dois conflitos na mesma instrução.
  const unique = new Map(rows.map((r) => [`${r.day}|${r.metric}|${r.dimension}|${r.label}`, r]));
  await db
    .insert(analyticsBreakdowns)
    .values([...unique.values()].map((r) => ({ workspaceId, socialAccountId, platform: "instagram" as const, ...r })))
    .onConflictDoUpdate({
      target: [analyticsBreakdowns.socialAccountId, analyticsBreakdowns.day, analyticsBreakdowns.metric, analyticsBreakdowns.dimension, analyticsBreakdowns.label],
      set: { value: sql`excluded.value`, updatedAt: new Date() },
    });
}

type DayValues = {
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  profileViews: number;
  websiteClicks: number;
  accountsEngaged: number;
  totalInteractions: number;
  replies: number;
  followerDelta: number;
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
    profileViews: v.profileViews,
    websiteClicks: v.websiteClicks,
    accountsEngaged: v.accountsEngaged,
    totalInteractions: v.totalInteractions,
    replies: v.replies,
    followerDelta: v.followerDelta,
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
        profileViews: sql`excluded.profile_views`,
        websiteClicks: sql`excluded.website_clicks`,
        accountsEngaged: sql`excluded.accounts_engaged`,
        totalInteractions: sql`excluded.total_interactions`,
        replies: sql`excluded.replies`,
        followerDelta: sql`excluded.follower_delta`,
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

    const agg = { likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, views: 0, clicks: 0, interactions: 0, avgWatchTime: 0, totalWatchTime: 0 };
    let ok = false;
    let reels = 0;
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
        agg.interactions += ins.interactions;
        agg.totalWatchTime += ins.totalWatchTime;
        // Tempo médio é média, não soma: acumula e divide pelos reels no fim.
        if (ins.avgWatchTime > 0) {
          agg.avgWatchTime += ins.avgWatchTime;
          reels += 1;
        }
        ok = true;
      } catch {
        // Mídia pode ter sido apagada no Instagram — ignora.
      }
    }
    if (ok) {
      if (reels > 0) agg.avgWatchTime = Math.round(agg.avgWatchTime / reels);
      await db.update(posts).set({ metrics: agg, metricsSyncedAt: new Date() }).where(eq(posts.id, post.id));
    }
  }
}
