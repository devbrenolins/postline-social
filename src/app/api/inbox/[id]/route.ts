import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inboxItems, activityLogs, socialAccounts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { replyToComment, sendDirectMessage, setCommentHidden, deleteComment } from "@/lib/instagram";
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

  /** Conta que recebeu o item — é dela o token que fala com a Meta. */
  const account = item.socialAccountId
    ? (await db.select().from(socialAccounts).where(eq(socialAccounts.id, item.socialAccountId)).limit(1))[0]
    : undefined;

  const updates: Partial<typeof inboxItems.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (body.status && ["unread", "read", "archived"].includes(body.status)) updates.status = body.status;
  if (typeof body.isFavorite === "boolean") updates.isFavorite = body.isFavorite;

  // Ocultar/reexibir só existe para comentário e só faz sentido no Instagram.
  if (typeof body.hidden === "boolean" && item.type === "comment") {
    if (!account?.accessToken || !item.externalId) {
      return NextResponse.json({ error: "Este comentário não está vinculado a uma conta conectada." }, { status: 400 });
    }
    try {
      await setCommentHidden(item.externalId, account.accessToken, body.hidden);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ocultar o comentário." }, { status: 502 });
    }
    updates.hidden = body.hidden;
  }

  if (typeof body.reply === "string" && body.reply.trim()) {
    const text = body.reply.trim();

    // A resposta agora sai de verdade: antes ficava só no banco e o seguidor
    // nunca era respondido no Instagram.
    if (account?.accessToken && account.externalId && item.externalId) {
      try {
        if (item.type === "comment") await replyToComment(item.externalId, account.accessToken, text);
        else await sendDirectMessage(account.externalId, account.accessToken, item.externalId, text);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "O Instagram recusou a resposta." },
          { status: 502 }
        );
      }
    }

    updates.replies = [...(item.replies ?? []), { text, at: new Date().toISOString(), by: user.name }];
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

/**
 * Remove o item da caixa. Com `?remote=1` apaga também o comentário **no
 * Instagram** — irreversível, então é opt-in explícito da interface.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  if (req.nextUrl.searchParams.get("remote") === "1") {
    const rows = await db
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.id, id), eq(inboxItems.workspaceId, user.workspaceId)))
      .limit(1);
    const item = rows[0];
    const account = item?.socialAccountId
      ? (await db.select().from(socialAccounts).where(eq(socialAccounts.id, item.socialAccountId)).limit(1))[0]
      : undefined;
    if (item?.type === "comment" && item.externalId && account?.accessToken) {
      try {
        await deleteComment(item.externalId, account.accessToken);
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao apagar no Instagram." }, { status: 502 });
      }
    }
  }

  await db.update(inboxItems).set({ deletedAt: new Date() })
    .where(and(eq(inboxItems.id, id), eq(inboxItems.workspaceId, user.workspaceId)));
  return NextResponse.json({ ok: true });
}
