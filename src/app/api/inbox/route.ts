import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inboxItems } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, desc, eq, isNull, sql, SQL } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const conds: SQL[] = [eq(inboxItems.workspaceId, user.workspaceId), isNull(inboxItems.deletedAt)];
  const type = sp.get("type");
  const platform = sp.get("platform");
  const status = sp.get("status");
  const favorites = sp.get("favorites") === "1";
  const q = sp.get("q")?.trim();
  const limit = Math.min(Number(sp.get("limit") ?? 20), 50);
  const offset = Number(sp.get("offset") ?? 0);

  if (type) conds.push(eq(inboxItems.type, type));
  if (platform) conds.push(eq(inboxItems.platform, platform as "instagram"));
  if (favorites) conds.push(eq(inboxItems.isFavorite, true));
  if (status) conds.push(eq(inboxItems.status, status));
  else conds.push(sql`${inboxItems.status} != 'archived'`);
  if (q) conds.push(sql`(${inboxItems.text} ILIKE ${"%" + q + "%"} OR ${inboxItems.authorName} ILIKE ${"%" + q + "%"} OR ${inboxItems.authorHandle} ILIKE ${"%" + q + "%"})`);

  const [rows, unread] = await Promise.all([
    db.select().from(inboxItems).where(and(...conds)).orderBy(desc(inboxItems.createdAt)).limit(limit + 1).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(inboxItems)
      .where(and(eq(inboxItems.workspaceId, user.workspaceId), eq(inboxItems.status, "unread"), isNull(inboxItems.deletedAt))),
  ]);

  return NextResponse.json({
    items: rows.slice(0, limit),
    hasMore: rows.length > limit,
    unread: Number(unread[0]?.count ?? 0),
  });
}
