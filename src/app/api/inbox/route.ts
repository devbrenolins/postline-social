import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inboxItems } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { syncWorkspaceInbox } from "@/lib/inbox-sync";
import { and, desc, eq, isNull, sql, SQL } from "drizzle-orm";

export const maxDuration = 30;

async function isInboxEmpty(workspaceId: string) {
  const rows = await db
    .select({ id: inboxItems.id })
    .from(inboxItems)
    .where(and(eq(inboxItems.workspaceId, workspaceId), isNull(inboxItems.deletedAt)))
    .limit(1);
  return rows.length === 0;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sp = req.nextUrl.searchParams;

  // O histórico do Instagram é importado só quando faz diferença: na primeira
  // vez (caixa vazia) ou a pedido. No dia a dia quem alimenta a caixa é o
  // webhook — varrer as publicações a cada abertura custaria ~7s por request.
  const forced = sp.get("refresh") === "1";
  if (forced || (await isInboxEmpty(user.workspaceId))) {
    try {
      await syncWorkspaceInbox(user.workspaceId, { force: forced });
    } catch {
      // Sem histórico ainda respondemos o que está no banco.
    }
  }

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
