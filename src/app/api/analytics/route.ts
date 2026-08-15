import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { analyticsDaily, analyticsBreakdowns, socialAccounts, posts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { refreshWorkspaceMetrics } from "@/lib/metrics";
import { getWorkspaceMedia } from "@/lib/ig-media";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql, SQL } from "drizzle-orm";
import type { Platform } from "@/components/ui";

// Pode chamar a Graph API para atualizar métricas (refresh lazy com TTL).
export const maxDuration = 30;

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Publicação em destaque, venha ela do Instagram ou da tabela de posts. */
type TopPost = {
  id: string;
  caption: string;
  mediaUrl: string | null;
  permalink: string | null;
  publishedAt: string | null;
  platform: Platform;
  /** REELS | FEED | STORY | AD — vazio quando vem da tabela de posts. */
  productType: string;
  metrics: { likes: number; comments: number; shares: number; saves: number; reach: number; views: number; avgWatchTime: number };
};

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const days = Math.min(Number(sp.get("days") ?? 30), 75);
  const platform = sp.get("platform");
  const withPlatform = platform && platform !== "all" ? (platform as Platform) : null;

  // Mantém os números frescos sem cron: só chama a API se estiverem "velhos".
  try {
    await refreshWorkspaceMetrics(user.workspaceId);
  } catch {
    // Se a API do Instagram falhar, ainda respondemos com o que há no banco.
  }

  const win = days - 1;
  const currFrom = sql`(CURRENT_DATE - ${win}::integer)`; // início do período atual
  const prevFrom = sql`(CURRENT_DATE - ${win * 2 + 1}::integer)`; // início do período anterior

  // Alcance, visualizações e engajamento vêm do snapshot diário da conta —
  // os mesmos números que o app do Instagram mostra, incluindo o conteúdo
  // publicado fora do Postline.
  const engExpr = sql<number>`(${analyticsDaily.likes}+${analyticsDaily.comments}+${analyticsDaily.shares}+${analyticsDaily.saves})`;

  const dayRange = (from: SQL, to?: SQL): SQL[] => {
    const c: SQL[] = [eq(analyticsDaily.workspaceId, user.workspaceId), isNull(analyticsDaily.deletedAt), gte(analyticsDaily.day, from)];
    if (to) c.push(lt(analyticsDaily.day, to));
    if (withPlatform) c.push(eq(analyticsDaily.platform, withPlatform));
    return c;
  };

  const totals = {
    reach: sql<number>`COALESCE(SUM(${analyticsDaily.reach}),0)`,
    views: sql<number>`COALESCE(SUM(${analyticsDaily.views}),0)`,
    engagement: sql<number>`COALESCE(SUM(${engExpr}),0)`,
    profileViews: sql<number>`COALESCE(SUM(${analyticsDaily.profileViews}),0)`,
    websiteClicks: sql<number>`COALESCE(SUM(${analyticsDaily.websiteClicks}),0)`,
    accountsEngaged: sql<number>`COALESCE(SUM(${analyticsDaily.accountsEngaged}),0)`,
    followersGained: sql<number>`COALESCE(SUM(${analyticsDaily.followerDelta}),0)`,
  };

  // Recortes: um GROUP BY resolve qualquer dimensão que a Meta devolva.
  const breakdownRange = (from: SQL): SQL[] => {
    const c: SQL[] = [eq(analyticsBreakdowns.workspaceId, user.workspaceId), gte(analyticsBreakdowns.day, from)];
    if (withPlatform) c.push(eq(analyticsBreakdowns.platform, withPlatform));
    return c;
  };

  // Reserva do destaque: posts publicados pelo próprio Postline, usados quando
  // não há conta conectada ou quando o filtro é de outra rede.
  const postConds: SQL[] = [
    eq(posts.workspaceId, user.workspaceId),
    eq(posts.status, "published"),
    isNotNull(posts.publishedAt),
    isNull(posts.deletedAt),
    gte(posts.publishedAt, currFrom),
  ];
  if (withPlatform) postConds.push(sql`${posts.networks}::jsonb ? ${withPlatform}`);

  // O destaque sai das publicações reais do Instagram, que incluem o que foi
  // postado fora do Postline; a tabela `posts` fica de reserva.
  const wantsInstagram = !withPlatform || withPlatform === "instagram";

  const [series, curr, prev, accounts, weekday, ownPosts, igMedia, cuts, demographics] = await Promise.all([
    db
      .select({
        day: analyticsDaily.day,
        followers: sql<number>`SUM(${analyticsDaily.followers})`,
        reach: sql<number>`SUM(${analyticsDaily.reach})`,
        views: sql<number>`SUM(${analyticsDaily.views})`,
        engagement: sql<number>`SUM(${engExpr})`,
        profileViews: sql<number>`SUM(${analyticsDaily.profileViews})`,
        followerDelta: sql<number>`SUM(${analyticsDaily.followerDelta})`,
      })
      .from(analyticsDaily)
      .where(and(...dayRange(currFrom)))
      .groupBy(analyticsDaily.day)
      .orderBy(analyticsDaily.day),
    db.select(totals).from(analyticsDaily).where(and(...dayRange(currFrom))),
    db.select(totals).from(analyticsDaily).where(and(...dayRange(prevFrom, currFrom))),
    db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.workspaceId, user.workspaceId), isNull(socialAccounts.deletedAt))),
    db
      .select({ dow: sql<number>`EXTRACT(DOW FROM ${analyticsDaily.day})::int`, eng: sql<number>`AVG(${engExpr})` })
      .from(analyticsDaily)
      .where(and(...dayRange(sql`(CURRENT_DATE - 120::integer)`)))
      .groupBy(sql`EXTRACT(DOW FROM ${analyticsDaily.day})`),
    db
      .select()
      .from(posts)
      .where(and(...postConds))
      .orderBy(desc(sql`COALESCE((${posts.metrics}->>'reach')::int,0)`))
      .limit(5),
    wantsInstagram
      ? getWorkspaceMedia(user.workspaceId).catch(() => null)
      : Promise.resolve(null),
    db
      .select({
        metric: analyticsBreakdowns.metric,
        dimension: analyticsBreakdowns.dimension,
        label: analyticsBreakdowns.label,
        value: sql<number>`SUM(${analyticsBreakdowns.value})`,
      })
      .from(analyticsBreakdowns)
      .where(and(...breakdownRange(currFrom), inArray(analyticsBreakdowns.metric, ["views", "reach"])))
      .groupBy(analyticsBreakdowns.metric, analyticsBreakdowns.dimension, analyticsBreakdowns.label),
    // Demografia é retrato do momento, não soma de período: vale a última leitura.
    db
      .select({
        metric: analyticsBreakdowns.metric,
        dimension: analyticsBreakdowns.dimension,
        label: analyticsBreakdowns.label,
        value: sql<number>`SUM(${analyticsBreakdowns.value})`,
      })
      .from(analyticsBreakdowns)
      .where(
        and(
          eq(analyticsBreakdowns.workspaceId, user.workspaceId),
          inArray(analyticsBreakdowns.metric, ["followers", "reached"]),
          eq(
            analyticsBreakdowns.day,
            sql`(SELECT MAX(b2.day) FROM ${analyticsBreakdowns} b2 WHERE b2.workspace_id = ${user.workspaceId} AND b2.metric IN ('followers','reached'))`
          )
        )
      )
      .groupBy(analyticsBreakdowns.metric, analyticsBreakdowns.dimension, analyticsBreakdowns.label),
  ]);

  const periodStart = new Date();
  periodStart.setHours(0, 0, 0, 0);
  periodStart.setDate(periodStart.getDate() - win);

  const fromInstagram: TopPost[] = (igMedia?.media ?? [])
    .filter((m) => new Date(m.timestamp) >= periodStart)
    .map((m) => ({
      id: m.id,
      caption: m.caption,
      mediaUrl: m.mediaUrl,
      permalink: m.permalink,
      publishedAt: m.timestamp,
      platform: "instagram" as Platform,
      productType: m.productType,
      metrics: { likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves, reach: m.reach, views: m.views, avgWatchTime: m.avgWatchTime },
    }));

  const fromOwnPosts: TopPost[] = ownPosts.map((p) => ({
    id: p.id,
    caption: p.caption ?? "",
    mediaUrl: p.mediaUrls?.[0] ?? null,
    permalink: null,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    platform: p.networks[0] ?? "instagram",
    productType: "",
    metrics: {
      likes: p.metrics?.likes ?? 0,
      comments: p.metrics?.comments ?? 0,
      shares: p.metrics?.shares ?? 0,
      saves: p.metrics?.saves ?? 0,
      reach: p.metrics?.reach ?? 0,
      views: p.metrics?.views ?? 0,
      avgWatchTime: p.metrics?.avgWatchTime ?? 0,
    },
  }));

  const topPosts = (fromInstagram.length > 0 ? fromInstagram : fromOwnPosts)
    .sort((a, b) => b.metrics.reach - a.metrics.reach || b.metrics.likes - a.metrics.likes)
    .slice(0, 5);

  const points = series.map((r) => ({
    day: String(r.day),
    followers: Number(r.followers ?? 0),
    reach: Number(r.reach ?? 0),
    views: Number(r.views ?? 0),
    engagement: Number(r.engagement ?? 0),
    profileViews: Number(r.profileViews ?? 0),
    followerDelta: Number(r.followerDelta ?? 0),
  }));

  // O total de seguidores só existe "de hoje": a API nunca devolve o número de
  // uma data passada. Reconstruímos a curva de trás para frente, tirando o
  // ganho de cada dia, e reancoramos sempre que existe um snapshot real —
  // assim os buracos de sincronização somem sem inventar dado.
  let anchor: number | null = null;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].followers > 0) {
      anchor = points[i].followers;
      continue;
    }
    if (anchor === null) continue;
    anchor = Math.max(0, anchor - (points[i + 1]?.followerDelta ?? 0));
    points[i].followers = anchor;
  }
  // Sem nenhum snapshot à direita, repete o primeiro valor conhecido.
  const firstKnown = points.find((p) => p.followers > 0)?.followers ?? 0;
  for (const p of points) {
    if (p.followers === 0) p.followers = firstKnown;
    else break;
  }

  const followersTotal = accounts.reduce((s, a) => s + a.followers, 0);
  const reachTotal = Number(curr[0]?.reach ?? 0);
  const viewsTotal = Number(curr[0]?.views ?? 0);
  const engagement = Number(curr[0]?.engagement ?? 0);
  const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);

  // Crescimento de seguidores: agora vem da própria Meta (`follower_count`),
  // em vez de comparar dois snapshots que podiam cair em dias sem registro.
  const followersGained = Number(curr[0]?.followersGained ?? 0);
  const followersBefore = Math.max(1, followersTotal - followersGained);
  const followersDelta = followersGained !== 0 ? (followersGained / followersBefore) * 100 : 0;

  // "Melhores dias" a partir do engajamento médio real por dia da semana.
  const byDow = new Map(weekday.map((r) => [Number(r.dow), Number(r.eng)]));
  const maxDow = Math.max(1, ...weekday.map((r) => Number(r.eng)));
  const weekdayScores = WEEKDAYS.map((day, i) => ({ day, score: Math.round(((byDow.get(i) ?? 0) / maxDow) * 100) }));

  // Recortes viram { rótulo, views, alcance } — o formato que os gráficos usam.
  const pivot = (dimension: string) => {
    const rows = new Map<string, { label: string; views: number; reach: number }>();
    for (const c of cuts) {
      if (c.dimension !== dimension) continue;
      const row = rows.get(c.label) ?? { label: c.label, views: 0, reach: 0 };
      if (c.metric === "views") row.views = Number(c.value);
      if (c.metric === "reach") row.reach = Number(c.value);
      rows.set(c.label, row);
    }
    return [...rows.values()].sort((a, b) => b.views - a.views || b.reach - a.reach);
  };

  const audience = (dimension: string) => {
    const rows = new Map<string, { label: string; followers: number; reached: number }>();
    for (const d of demographics) {
      if (d.dimension !== dimension) continue;
      const row = rows.get(d.label) ?? { label: d.label, followers: 0, reached: 0 };
      if (d.metric === "followers") row.followers = Number(d.value);
      if (d.metric === "reached") row.reached = Number(d.value);
      rows.set(d.label, row);
    }
    const list = [...rows.values()];
    // Cidade e país são rankings; idade e gênero têm ordem natural própria.
    return dimension === "age" || dimension === "gender"
      ? list.sort((a, b) => a.label.localeCompare(b.label))
      : list.sort((a, b) => b.followers - a.followers || b.reached - a.reached).slice(0, 8);
  };

  return NextResponse.json({
    series: points,
    kpis: {
      followers: followersTotal,
      reach: reachTotal,
      views: viewsTotal,
      engagement,
      engagementRate: reachTotal > 0 ? (engagement / reachTotal) * 100 : 0,
      followersDelta,
      followersGained,
      profileViews: Number(curr[0]?.profileViews ?? 0),
      websiteClicks: Number(curr[0]?.websiteClicks ?? 0),
      accountsEngaged: Number(curr[0]?.accountsEngaged ?? 0),
      reachDelta: pct(reachTotal, Number(prev[0]?.reach ?? 0)),
      viewsDelta: pct(viewsTotal, Number(prev[0]?.views ?? 0)),
      engagementDelta: pct(engagement, Number(prev[0]?.engagement ?? 0)),
      profileViewsDelta: pct(Number(curr[0]?.profileViews ?? 0), Number(prev[0]?.profileViews ?? 0)),
      websiteClicksDelta: pct(Number(curr[0]?.websiteClicks ?? 0), Number(prev[0]?.websiteClicks ?? 0)),
    },
    breakdowns: { followType: pivot("follow_type"), format: pivot("media_product_type") },
    audience: { city: audience("city"), country: audience("country"), age: audience("age"), gender: audience("gender") },
    accounts: accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, followers: a.followers })),
    weekdayScores,
    topPosts,
  });
}
