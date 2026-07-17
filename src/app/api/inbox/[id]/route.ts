import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inboxItems, activityLogs } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, eq, isNull } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const rows = await db.select().from(inboxItems)
    .where(and(eq(inboxItems.id, id), eq(inboxItems.workspaceId, user.workspaceId), isNull(inboxItems.deletedAt)))
    .limit(1);
  const item = rows[0];
  if (!item) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });

  const updates: Partial<typeof inboxItems.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (body.status && ["unread", "read", "archived"].includes(body.status)) updates.status = body.status;
  if (typeof body.isFavorite === "boolean") updates.isFavorite = body.isFavorite;
  if (typeof body.reply === "string" && body.reply.trim()) {
    updates.replies = [...(item.replies ?? []), { text: body.reply.trim(), at: new Date().toISOString(), by: user.name }];
    updates.status = "read";
    await db.insert(activityLogs).values({
      workspaceId: user.workspaceId, userId: user.id, actorName: user.name, actorColor: user.avatarColor,
      action: `respondeu ${item.type === "message" ? "uma mensagem" : "um comentário"} de ${item.authorName}`,
      entity: "inbox", entityId: item.id,
    });
  }

  const [updated] = await db.update(inboxItems).set(updates).where(eq(inboxItems.id, id)).returning();
  return NextResponse.json({ item: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  await db.update(inboxItems).set({ deletedAt: new Date() })
    .where(and(eq(inboxItems.id, id), eq(inboxItems.workspaceId, user.workspaceId)));
  return NextResponse.json({ ok: true });
}
