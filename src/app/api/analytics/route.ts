import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { analyticsDaily, socialAccounts, posts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { refreshWorkspaceMetrics } from "@/lib/metrics";
import { and, desc, eq, gte, isNotNull, isNull, lt, sql, SQL } from "drizzle-orm";
import type { Platform } from "@/components/ui";

// Pode chamar a Graph API para atualizar métricas (refresh lazy com TTL).
export const maxDuration = 30;

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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

  // Engajamento e visualizações reais vêm de posts.metrics (por post).
  const engExpr = sql<number>`COALESCE((${posts.metrics}->>'likes')::int,0)+COALESCE((${posts.metrics}->>'comments')::int,0)+COALESCE((${posts.metrics}->>'shares')::int,0)+COALESCE((${posts.metrics}->>'saves')::int,0)`;
  const viewsExpr = sql<number>`COALESCE((${posts.metrics}->>'views')::int,0)`;
  const pubDay = sql<string>`(${posts.publishedAt} AT TIME ZONE 'UTC')::date`;

  // Alcance/seguidores por dia (snapshots de conta).
  const adConds: SQL[] = [eq(analyticsDaily.workspaceId, user.workspaceId), isNull(analyticsDaily.deletedAt), gte(analyticsDaily.day, currFrom)];
  if (withPlatform) adConds.push(eq(analyticsDaily.platform, withPlatform));

  const postBase = (from: SQL, to?: SQL): SQL[] => {
    const c: SQL[] = [eq(posts.workspaceId, user.workspaceId), eq(posts.status, "published"), isNotNull(posts.publishedAt), isNull(posts.deletedAt), gte(posts.publishedAt, from)];
    if (to) c.push(lt(posts.publishedAt, to));
    if (withPlatform) c.push(sql`${posts.networks}::jsonb ? ${withPlatform}`);
    return c;
  };

  const [reachSeries, engSeries, currPost, prevPost, currReach, prevReach, accounts, weekday, topPosts] = await Promise.all([
    db.select({ day: analyticsDaily.day, followers: sql<number>`SUM(${analyticsDaily.followers})`, reach: sql<number>`SUM(${analyticsDaily.reach})` })
      .from(analyticsDaily).where(and(...adConds)).groupBy(analyticsDaily.day).orderBy(analyticsDaily.day),
    db.select({ day: pubDay, engagement: sql<number>`SUM(${engExpr})`, views: sql<number>`SUM(${viewsExpr})` })
      .from(posts).where(and(...postBase(currFrom))).groupBy(pubDay),
    db.select({ engagement: sql<number>`COALESCE(SUM(${engExpr}),0)`, views: sql<number>`COALESCE(SUM(${viewsExpr}),0)` })
      .from(posts).where(and(...postBase(currFrom))),
    db.select({ engagement: sql<number>`COALESCE(SUM(${engExpr}),0)`, views: sql<number>`COALESCE(SUM(${viewsExpr}),0)` })
      .from(posts).where(and(...postBase(prevFrom, currFrom))),
    db.select({ reach: sql<number>`COALESCE(SUM(${analyticsDaily.reach}),0)` }).from(analyticsDaily).where(and(...adConds)),
    db.select({ reach: sql<number>`COALESCE(SUM(${analyticsDaily.reach}),0)` }).from(analyticsDaily)
      .where(and(eq(analyticsDaily.workspaceId, user.workspaceId), isNull(analyticsDaily.deletedAt), gte(analyticsDaily.day, prevFrom), lt(analyticsDaily.day, currFrom), ...(withPlatform ? [eq(analyticsDaily.platform, withPlatform)] : []))),
    db.select().from(socialAccounts).where(and(eq(socialAccounts.workspaceId, user.workspaceId), isNull(socialAccounts.deletedAt))),
    db.select({ dow: sql<number>`EXTRACT(DOW FROM ${posts.publishedAt})::int`, eng: sql<number>`AVG(${engExpr})` })
      .from(posts).where(and(...postBase(sql`(CURRENT_DATE - 120::integer)`))).groupBy(sql`EXTRACT(DOW FROM ${posts.publishedAt})`),
    db.select().from(posts).where(and(...postBase(currFrom)))
      .orderBy(desc(sql`COALESCE((${posts.metrics}->>'reach')::int,0)`)).limit(5),
  ]);

  // Une alcance/seguidores (por dia) com engajamento/views (por dia de publicação).
  const engByDay = new Map(engSeries.map((r) => [String(r.day), r]));
  const followersByDay = new Map(reachSeries.map((r) => [String(r.day), Number(r.followers)]));
  const reachByDay = new Map(reachSeries.map((r) => [String(r.day), Number(r.reach)]));
  const allDays = Array.from(new Set([...reachByDay.keys(), ...engByDay.keys()])).sort();
  const series = allDays.map((day) => ({
    day,
    followers: followersByDay.get(day) ?? 0,
    reach: reachByDay.get(day) ?? 0,
    engagement: Number(engByDay.get(day)?.engagement ?? 0),
    views: Number(engByDay.get(day)?.views ?? 0),
  }));

  const followersTotal = accounts.reduce((s, a) => s + a.followers, 0);
  const reachTotal = Number(currReach[0]?.reach ?? 0);
  const engagement = Number(currPost[0]?.engagement ?? 0);
  const viewsTotal = Number(currPost[0]?.views ?? 0);
  const prevReachTotal = Number(prevReach[0]?.reach ?? 0);
  const prevEngagement = Number(prevPost[0]?.engagement ?? 0);
  const prevViews = Number(prevPost[0]?.views ?? 0);
  const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);

  // Crescimento de seguidores real: primeiro vs. último snapshot do período.
  const followedSeries = reachSeries.map((r) => Number(r.followers)).filter((n) => n > 0);
  const followersDelta = followedSeries.length >= 2 ? pct(followedSeries[followedSeries.length - 1], followedSeries[0]) : 0;

  // "Melhores dias" a partir do engajamento médio real por dia da semana.
  const byDow = new Map(weekday.map((r) => [Number(r.dow), Number(r.eng)]));
  const maxDow = Math.max(1, ...weekday.map((r) => Number(r.eng)));
  const weekdayScores = WEEKDAYS.map((day, i) => ({ day, score: Math.round(((byDow.get(i) ?? 0) / maxDow) * 100) }));

  return NextResponse.json({
    series,
    kpis: {
      followers: followersTotal,
      reach: reachTotal,
      views: viewsTotal,
      engagement,
      engagementRate: reachTotal > 0 ? (engagement / reachTotal) * 100 : 0,
      followersDelta,
      reachDelta: pct(reachTotal, prevReachTotal),
      viewsDelta: pct(viewsTotal, prevViews),
      engagementDelta: pct(engagement, prevEngagement),
    },
    accounts: accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, followers: a.followers })),
    weekdayScores,
    topPosts,
  });
}
