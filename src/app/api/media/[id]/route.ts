import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { media } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, eq, isNull } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const updates: Partial<typeof media.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name.slice(0, 200);
  if (typeof body.isFavorite === "boolean") updates.isFavorite = body.isFavorite;
  if (body.folderId !== undefined) updates.folderId = body.folderId || null;
  if (Array.isArray(body.tags)) updates.tags = body.tags.map(String).slice(0, 8);
  if (body.action === "trash") updates.trashedAt = new Date();
  if (body.action === "restore") updates.trashedAt = null;

  const [row] = await db.update(media).set(updates)
    .where(and(eq(media.id, id), eq(media.workspaceId, user.workspaceId), isNull(media.deletedAt)))
    .returning();
  if (!row) return NextResponse.json({ error: "Mídia não encontrada." }, { status: 404 });
  return NextResponse.json({ media: row });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const permanent = req.nextUrl.searchParams.get("permanent") === "1";
  if (permanent) {
    await db.delete(media).where(and(eq(media.id, id), eq(media.workspaceId, user.workspaceId)));
  } else {
    await db.update(media).set({ trashedAt: new Date() })
      .where(and(eq(media.id, id), eq(media.workspaceId, user.workspaceId)));
  }
  return NextResponse.json({ ok: true });
}
