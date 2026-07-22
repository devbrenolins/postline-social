import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, activityLogs } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, eq, isNull } from "drizzle-orm";
import { publishPost } from "@/lib/publishing";

export const maxDuration = 60;

async function loadPost(id: string, workspaceId: string) {
  const rows = await db.select().from(posts)
    .where(and(eq(posts.id, id), eq(posts.workspaceId, workspaceId), isNull(posts.deletedAt)))
    .limit(1);
  return rows[0];
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const post = await loadPost(id, user.workspaceId);
  if (!post) return NextResponse.json({ error: "Publicação não encontrada." }, { status: 404 });

  const body = await req.json();
  const action = body.action as string | undefined;
  const now = new Date();

  // ---- Ações especiais ----
  if (action === "duplicate") {
    const [copy] = await db.insert(posts).values({
      workspaceId: post.workspaceId, authorId: user.id, clientId: post.clientId,
      caption: post.caption, firstComment: post.firstComment, networks: post.networks,
      mediaUrls: post.mediaUrls, format: post.format, labels: post.labels,
      status: "draft", history: [{ caption: post.caption, at: now.toISOString() }],
    }).returning();
    await log(user, "duplicou uma publicação", post.id);
    return NextResponse.json({ post: copy }, { status: 201 });
  }
  if (action === "publish") {
    try {
      const { status } = await publishPost(post.id, user.workspaceId);
      const updated = await loadPost(id, user.workspaceId);
      await log(user, status === "published" ? "publicou imediatamente" : "tentou publicar (falhou)", post.id);
      return NextResponse.json({ post: updated }, { status: status === "published" ? 200 : 502 });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao publicar." }, { status: 400 });
    }
  }
  if (action === "cancel") {
    const [updated] = await db.update(posts)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(posts.id, post.id)).returning();
    await log(user, "cancelou uma publicação agendada", post.id);
    return NextResponse.json({ post: updated });
  }
  if (action === "restore") {
    const [updated] = await db.update(posts)
      .set({ status: body.scheduledAt || post.scheduledAt ? "scheduled" : "draft", updatedAt: now })
      .where(eq(posts.id, post.id)).returning();
    return NextResponse.json({ post: updated });
  }

  // ---- Edição de campos (autosave incluso) ----
  const updates: Partial<typeof posts.$inferInsert> & { updatedAt: Date } = { updatedAt: now };
  let bumped = false;
  if (typeof body.caption === "string" && body.caption !== post.caption) {
    updates.caption = body.caption;
    updates.version = post.version + 1;
    const history = [...(post.history ?? []), { caption: body.caption, at: now.toISOString() }].slice(-20);
    updates.history = history;
    bumped = true;
  }
  if (typeof body.firstComment === "string") updates.firstComment = body.firstComment;
  if (Array.isArray(body.networks)) updates.networks = body.networks;
  if (Array.isArray(body.mediaUrls)) updates.mediaUrls = body.mediaUrls;
  if (typeof body.format === "string") updates.format = body.format;
  if (Array.isArray(body.labels)) updates.labels = body.labels;
  if (body.clientId !== undefined) updates.clientId = body.clientId || null;
  if (body.status && ["draft", "scheduled", "cancelled"].includes(body.status)) updates.status = body.status;
  if (body.scheduledAt !== undefined) {
    updates.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  }

  const [updated] = await db.update(posts).set(updates).where(eq(posts.id, post.id)).returning();
  if (bumped) await log(user, "editou uma publicação", post.id);
  return NextResponse.json({ post: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const post = await loadPost(id, user.workspaceId);
  if (!post) return NextResponse.json({ error: "Publicação não encontrada." }, { status: 404 });
  await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, post.id));
  await log(user, "excluiu uma publicação", post.id);
  return NextResponse.json({ ok: true });
}

async function log(user: { id: string; name: string; avatarColor: string; workspaceId: string }, action: string, entityId: string) {
  await db.insert(activityLogs).values({
    workspaceId: user.workspaceId, userId: user.id, actorName: user.name, actorColor: user.avatarColor,
    action, entity: "posts", entityId,
  });
}
