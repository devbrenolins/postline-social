import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { directAutomations, posts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, desc, eq, isNull } from "drizzle-orm";

export const maxDuration = 30;

/**
 * Automação de direct de uma publicação específica.
 *
 * Existe para o composer e para o calendário poderem configurar a resposta
 * automática sem tirar a pessoa do fluxo e mandá-la para o Studio.
 */

async function loadPost(id: string, workspaceId: string) {
  const rows = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.workspaceId, workspaceId), isNull(posts.deletedAt)))
    .limit(1);
  return rows[0];
}

function parseKeywords(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  if (!(await loadPost(id, user.workspaceId))) {
    return NextResponse.json({ error: "Publicação não encontrada." }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(directAutomations)
    .where(
      and(
        eq(directAutomations.workspaceId, user.workspaceId),
        eq(directAutomations.postId, id),
        isNull(directAutomations.deletedAt)
      )
    )
    .orderBy(desc(directAutomations.createdAt));

  return NextResponse.json({ automations: rows });
}

/** Cria ou atualiza a automação da publicação. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  if (!(await loadPost(id, user.workspaceId))) {
    return NextResponse.json({ error: "Publicação não encontrada." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const keywords = parseKeywords(body.keywords);
  const response = String(body.response ?? "").trim();
  const name = String(body.name ?? "").trim() || "Resposta automática";

  if (!keywords.length) return NextResponse.json({ error: "Informe ao menos uma palavra-gatilho." }, { status: 400 });
  if (!response) return NextResponse.json({ error: "Escreva a mensagem que será enviada." }, { status: 400 });

  const automationId = body.automationId ? String(body.automationId) : null;

  if (automationId) {
    const [updated] = await db
      .update(directAutomations)
      .set({ name, triggerKeywords: keywords, responseTemplate: response, updatedAt: new Date() })
      .where(
        and(
          eq(directAutomations.id, automationId),
          eq(directAutomations.workspaceId, user.workspaceId),
          eq(directAutomations.postId, id),
          isNull(directAutomations.deletedAt)
        )
      )
      .returning();
    if (!updated) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
    return NextResponse.json({ automation: updated });
  }

  const [created] = await db
    .insert(directAutomations)
    .values({
      workspaceId: user.workspaceId,
      name,
      platform: "instagram",
      postId: id,
      triggerKeywords: keywords,
      responseTemplate: response,
    })
    .returning();

  return NextResponse.json({ automation: created });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const automationId = new URL(req.url).searchParams.get("automationId");
  if (!automationId) return NextResponse.json({ error: "Informe a automação." }, { status: 400 });

  await db
    .update(directAutomations)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(directAutomations.id, automationId),
        eq(directAutomations.workspaceId, user.workspaceId),
        eq(directAutomations.postId, id)
      )
    );

  return NextResponse.json({ ok: true });
}
