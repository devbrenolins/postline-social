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
  };

  // Top publicações continuam vindo dos posts do Postline (só eles têm mídia
  // e legenda no banco); as métricas por post são sincronizadas em metrics.ts.
  const postConds: SQL[] = [
    eq(posts.workspaceId, user.workspaceId),
    eq(posts.status, "published"),
    isNotNull(posts.publishedAt),
    isNull(posts.deletedAt),
    gte(posts.publishedAt, currFrom),
  ];
  if (withPlatform) postConds.push(sql`${posts.networks}::jsonb ? ${withPlatform}`);

  const [series, curr, prev, accounts, weekday, topPosts] = await Promise.all([
    db
      .select({
        day: analyticsDaily.day,
        followers: sql<number>`SUM(${analyticsDaily.followers})`,
        reach: sql<number>`SUM(${analyticsDaily.reach})`,
        views: sql<number>`SUM(${analyticsDaily.views})`,
        engagement: sql<number>`SUM(${engExpr})`,
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
  ]);

  // Seguidores só são gravados no dia em que o app roda; nos dias preenchidos
  // pelo histórico do Instagram o valor fica 0. Repetimos o último total
  // conhecido para a curva não despencar em buracos de sincronização.
  const points = series.map((r) => ({
    day: String(r.day),
    followers: Number(r.followers ?? 0),
    reach: Number(r.reach ?? 0),
    views: Number(r.views ?? 0),
    engagement: Number(r.engagement ?? 0),
  }));
  let last = 0;
  for (const p of points) {
    if (p.followers > 0) last = p.followers;
    else p.followers = last;
  }
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

  // Crescimento de seguidores real: primeiro vs. último snapshot do período.
  const followerPoints = points.map((p) => p.followers).filter((n) => n > 0);
  const followersDelta = followerPoints.length >= 2 ? pct(followerPoints[followerPoints.length - 1], followerPoints[0]) : 0;

  // "Melhores dias" a partir do engajamento médio real por dia da semana.
  const byDow = new Map(weekday.map((r) => [Number(r.dow), Number(r.eng)]));
  const maxDow = Math.max(1, ...weekday.map((r) => Number(r.eng)));
  const weekdayScores = WEEKDAYS.map((day, i) => ({ day, score: Math.round(((byDow.get(i) ?? 0) / maxDow) * 100) }));

  return NextResponse.json({
    series: points,
    kpis: {
      followers: followersTotal,
      reach: reachTotal,
      views: viewsTotal,
      engagement,
      engagementRate: reachTotal > 0 ? (engagement / reachTotal) * 100 : 0,
      followersDelta,
      reachDelta: pct(reachTotal, Number(prev[0]?.reach ?? 0)),
      viewsDelta: pct(viewsTotal, Number(prev[0]?.views ?? 0)),
      engagementDelta: pct(engagement, Number(prev[0]?.engagement ?? 0)),
    },
    accounts: accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, followers: a.followers })),
    weekdayScores,
    topPosts,
  });
}
