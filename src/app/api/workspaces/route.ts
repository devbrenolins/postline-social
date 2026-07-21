import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { workspaces, workspaceMembers, activityLogs } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getSessionUser, WORKSPACE_COOKIE } from "@/lib/auth";

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Lista os workspaces do usuário (para o seletor de workspace). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      color: workspaces.color,
      plan: workspaces.plan,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, user.id),
        eq(workspaceMembers.status, "active"),
        isNull(workspaceMembers.deletedAt),
        isNull(workspaces.deletedAt)
      )
    );

  return NextResponse.json({ workspaces: rows, activeId: user.workspaceId });
}

/** Cria um novo workspace e o define como ativo. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Informe o nome do workspace." }, { status: 400 });

  const slug = `${slugify(name) || "workspace"}-${user.id.slice(0, 6)}-${Math.random().toString(36).slice(2, 6)}`;
  const [ws] = await db
    .insert(workspaces)
    .values({ name, slug, color: user.avatarColor, ownerId: user.id })
    .returning();
  await db.insert(workspaceMembers).values({
    workspaceId: ws.id,
    userId: user.id,
    role: "admin",
    status: "active",
    avatarColor: user.avatarColor,
  });
  await db.insert(activityLogs).values({
    workspaceId: ws.id,
    userId: user.id,
    actorName: user.name,
    actorColor: user.avatarColor,
    action: "criou o workspace",
    entity: "workspace",
    entityId: ws.id,
  });

  const store = await cookies();
  store.set(WORKSPACE_COOKIE, ws.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });

  return NextResponse.json({ ok: true, workspace: { id: ws.id, name: ws.name, color: ws.color, plan: ws.plan } });
}

/** Troca o workspace ativo. */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body.workspaceId ?? "");

  const membership = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id),
        eq(workspaceMembers.status, "active"),
        isNull(workspaceMembers.deletedAt)
      )
    )
    .limit(1);
  if (!membership[0]) return NextResponse.json({ error: "Você não pertence a este workspace." }, { status: 403 });

  const store = await cookies();
  store.set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return NextResponse.json({ ok: true });
}
