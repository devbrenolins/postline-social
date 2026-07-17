import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, eq, isNull } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const updates: Partial<typeof clients.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  for (const key of ["name", "industry", "responsible", "notes", "status", "color"] as const) {
    if (typeof body[key] === "string") updates[key] = body[key];
  }
  const [row] = await db.update(clients).set(updates)
    .where(and(eq(clients.id, id), eq(clients.workspaceId, user.workspaceId), isNull(clients.deletedAt)))
    .returning();
  if (!row) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  return NextResponse.json({ client: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  await db.update(clients).set({ deletedAt: new Date() })
    .where(and(eq(clients.id, id), eq(clients.workspaceId, user.workspaceId)));
  return NextResponse.json({ ok: true });
}
