import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { workspaces, workspaceMembers, activityLogs, users } from "@/db/schema";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { ACTIVE_WORKSPACE_SETTING, getSessionUser, WORKSPACE_COOKIE } from "@/lib/auth";
import { TRIAL_DAYS } from "@/lib/plans";

function trialDeadline() {
  return new Date(Date.now() + TRIAL_DAYS * 86_400_000);
}

/**
 * Grava o workspace ativo nos dois lugares: em `users.settings` (fonte de
 * verdade, acompanha a conta em qualquer aparelho) e no cookie, que continua
 * servindo de atalho para evitar uma leitura a mais.
 */
async function setActiveWorkspace(userId: string, workspaceId: string) {
  await db
    .update(users)
    .set({
      settings: sql`coalesce(${users.settings}, '{}'::jsonb) || ${JSON.stringify({ [ACTIVE_WORKSPACE_SETTING]: workspaceId })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  const store = await cookies();
  store.set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

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

  // Um teste por pessoa: workspaces extras herdam o prazo do primeiro que ela
  // criou, em vez de ganhar 7 dias novos a cada um.
  const [firstOwned] = await db
    .select({ trialEndsAt: workspaces.trialEndsAt, createdAt: workspaces.createdAt })
    .from(workspaces)
    .where(eq(workspaces.ownerId, user.id))
    .orderBy(asc(workspaces.createdAt))
    .limit(1);
  const trialEndsAt = firstOwned ? (firstOwned.trialEndsAt ?? new Date(firstOwned.createdAt.getTime() + TRIAL_DAYS * 86_400_000)) : trialDeadline();

  const slug = `${slugify(name) || "workspace"}-${user.id.slice(0, 6)}-${Math.random().toString(36).slice(2, 6)}`;
  const [ws] = await db
    .insert(workspaces)
    .values({ name, slug, color: user.avatarColor, ownerId: user.id, plan: "trial", trialEndsAt })
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

  await setActiveWorkspace(user.id, ws.id);

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

  await setActiveWorkspace(user.id, workspaceId);
  return NextResponse.json({ ok: true });
}
