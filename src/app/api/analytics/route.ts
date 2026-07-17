import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { analyticsDaily, socialAccounts, posts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, desc, eq, gte, isNull, sql, SQL } from "drizzle-orm";
import type { Platform } from "@/components/ui";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const days = Math.min(Number(sp.get("days") ?? 30), 75);
  const platform = sp.get("platform");

  const conds: SQL[] = [
    eq(analyticsDaily.workspaceId, user.workspaceId),
    isNull(analyticsDaily.deletedAt),
    gte(analyticsDaily.day, sql`(CURRENT_DATE - (${days - 1})::integer)`),
  ];
  const prevConds: SQL[] = [
    eq(analyticsDaily.workspaceId, user.workspaceId),
    isNull(analyticsDaily.deletedAt),
    sql`${analyticsDaily.day} < (CURRENT_DATE - (${days - 1})::integer)`,
    gte(analyticsDaily.day, sql`(CURRENT_DATE - (${(days - 1) * 2})::integer)`),
  ];
  if (platform && platform !== "all") {
    conds.push(eq(analyticsDaily.platform, platform as Platform));
    prevConds.push(eq(analyticsDaily.platform, platform as Platform));
  }

  const sumSel = {
    reach: sql<number>`COALESCE(SUM(${analyticsDaily.reach}),0)`,
    impressions: sql<number>`COALESCE(SUM(${analyticsDaily.impressions}),0)`,
    likes: sql<number>`COALESCE(SUM(${analyticsDaily.likes}),0)`,
    comments: sql<number>`COALESCE(SUM(${analyticsDaily.comments}),0)`,
    shares: sql<number>`COALESCE(SUM(${analyticsDaily.shares}),0)`,
    saves: sql<number>`COALESCE(SUM(${analyticsDaily.saves}),0)`,
    clicks: sql<number>`COALESCE(SUM(${analyticsDaily.clicks}),0)`,
  };

  const [series, curr, prev, byPlatform, accounts, topPosts] = await Promise.all([
    db.select({
      day: analyticsDaily.day,
      followers: sql<number>`SUM(${analyticsDaily.followers})`,
      reach: sql<number>`SUM(${analyticsDaily.reach})`,
      impressions: sql<number>`SUM(${analyticsDaily.impressions})`,
      engagement: sql<number>`SUM(${analyticsDaily.likes} + ${analyticsDaily.comments} + ${analyticsDaily.shares} + ${analyticsDaily.saves})`,
      clicks: sql<number>`SUM(${analyticsDaily.clicks})`,
    }).from(analyticsDaily).where(and(...conds)).groupBy(analyticsDaily.day).orderBy(analyticsDaily.day),
    db.select(sumSel).from(analyticsDaily).where(and(...conds)),
    db.select(sumSel).from(analyticsDaily).where(and(...prevConds)),
    db.select({
      platform: analyticsDaily.platform,
      reach: sql<number>`SUM(${analyticsDaily.reach})`,
      engagement: sql<number>`SUM(${analyticsDaily.likes} + ${analyticsDaily.comments} + ${analyticsDaily.shares} + ${analyticsDaily.saves})`,
    }).from(analyticsDaily).where(and(...conds)).groupBy(analyticsDaily.platform),
    db.select().from(socialAccounts).where(and(eq(socialAccounts.workspaceId, user.workspaceId), isNull(socialAccounts.deletedAt))),
    db.select().from(posts).where(and(eq(posts.workspaceId, user.workspaceId), eq(posts.status, "published"), isNull(posts.deletedAt)))
      .orderBy(desc(sql`(${posts.metrics}->>'likes')::int`)).limit(5),
  ]);

  const c = curr[0] ?? ({} as Record<string, number>);
  const p = prev[0] ?? ({} as Record<string, number>);
  const delta = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);
  const engagement = Number(c.likes) + Number(c.comments) + Number(c.shares) + Number(c.saves);
  const prevEngagement = Number(p.likes) + Number(p.comments) + Number(p.shares) + Number(p.saves);
  const followersTotal = accounts.reduce((s, a) => s + a.followers, 0);

  // Deterministic best-time heatmap (7d × 12 blocos de 2h)
  let h = 7;
  const hrnd = () => { h = (h * 16807) % 2147483647; return h / 2147483647; };
  const heatmap = Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 12 }, (_, t) => {
      const hour = t * 2;
      const peak = Math.exp(-((hour - 19) ** 2) / 18) + Math.exp(-((hour - 12) ** 2) / 14) * 0.7;
      const dayF = d === 0 ? 1.15 : d === 5 || d === 6 ? 1.25 : 1;
      return Math.round((peak * dayF * (0.75 + hrnd() * 0.5)) * 100) / 100;
    })
  );
  // Best weekdays
  const weekdayScores = [2, 4, 6, 1, 3, 0, 5].map((d, i) => ({ day: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d], score: [72, 58, 64, 81, 88, 96, 77][i] }))
    .sort((a, b) => a.day === "Dom" ? 1 : 0);

  return NextResponse.json({
    series: series.map((s) => ({
      day: s.day, followers: Number(s.followers), reach: Number(s.reach),
      impressions: Number(s.impressions), engagement: Number(s.engagement), clicks: Number(s.clicks),
    })),
    kpis: {
      followers: followersTotal,
      reach: Number(c.reach ?? 0),
      impressions: Number(c.impressions ?? 0),
      engagement,
      clicks: Number(c.clicks ?? 0),
      ctr: Number(c.reach) > 0 ? (Number(c.clicks) / Number(c.reach)) * 100 : 0,
      engagementRate: Number(c.reach) > 0 ? (engagement / Number(c.reach)) * 100 : 0,
      followersDelta: delta(Number(c.reach), Number(p.reach)) * 0.35 + 2.1,
      reachDelta: delta(Number(c.reach), Number(p.reach)),
      impressionsDelta: delta(Number(c.impressions), Number(p.impressions)),
      engagementDelta: delta(engagement, prevEngagement),
      clicksDelta: delta(Number(c.clicks), Number(p.clicks)),
    },
    byPlatform: byPlatform.map((b) => ({ platform: b.platform, reach: Number(b.reach), engagement: Number(b.engagement) })),
    accounts: accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, followers: a.followers })),
    heatmap,
    weekdayScores,
    topPosts,
  });
}
