import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, activityLogs } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, desc, asc, eq, isNull, isNotNull, sql, SQL } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const platform = sp.get("platform");
  const clientId = sp.get("client");
  const scope = sp.get("scope"); // scheduled | published | all
  const q = sp.get("q")?.trim();
  const limit = Math.min(Number(sp.get("limit") ?? 200), 500);
  const offset = Number(sp.get("offset") ?? 0);

  const conds: SQL[] = [eq(posts.workspaceId, user.workspaceId), isNull(posts.deletedAt)];
  if (status) conds.push(eq(posts.status, status as "draft"));
  if (scope === "scheduled") conds.push(isNotNull(posts.scheduledAt));
  if (clientId) conds.push(eq(posts.clientId, clientId));
  if (platform) conds.push(sql`${posts.networks}::jsonb ? ${platform}`);
  if (q) conds.push(sql`${posts.caption} ILIKE ${"%" + q + "%"}`);

  const rows = await db
    .select()
    .from(posts)
    .where(and(...conds))
    .orderBy(scope === "scheduled" ? asc(posts.scheduledAt) : desc(sql`COALESCE(${posts.scheduledAt}, ${posts.publishedAt}, ${posts.createdAt})`))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ posts: rows });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json();
  const status = (body.status as "draft" | "scheduled" | "published") ?? "draft";
  const now = new Date();

  const [post] = await db.insert(posts).values({
    workspaceId: user.workspaceId,
    authorId: user.id,
    clientId: body.clientId || null,
    caption: String(body.caption ?? ""),
    firstComment: String(body.firstComment ?? ""),
    networks: Array.isArray(body.networks) ? body.networks : [],
    mediaUrls: Array.isArray(body.mediaUrls) ? body.mediaUrls : [],
    format: body.format ?? "feed",
    status,
    scheduledAt: status === "scheduled" && body.scheduledAt ? new Date(body.scheduledAt) : null,
    publishedAt: status === "published" ? now : null,
    labels: Array.isArray(body.labels) ? body.labels : [],
    metrics: status === "published" ? fakeMetrics() : undefined,
    history: [{ caption: String(body.caption ?? ""), at: now.toISOString() }],
  }).returning();

  await db.insert(activityLogs).values({
    workspaceId: user.workspaceId, userId: user.id, actorName: user.name, actorColor: user.avatarColor,
    action: status === "draft" ? "salvou um rascunho" : status === "scheduled" ? "agendou uma publicação" : "publicou imediatamente",
    entity: "posts", entityId: post.id,
  });

  return NextResponse.json({ post }, { status: 201 });
}

export function fakeMetrics() {
  const likes = Math.floor(180 + Math.random() * 1200);
  return {
    likes,
    comments: Math.floor(likes * (0.05 + Math.random() * 0.07)),
    shares: Math.floor(likes * (0.06 + Math.random() * 0.1)),
    saves: Math.floor(likes * (0.08 + Math.random() * 0.1)),
    reach: likes * (7 + Math.floor(Math.random() * 6)),
    clicks: Math.floor(likes * 0.3),
  };
}
