import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { denyIfTrialExpired, denyUnlessRole } from "@/lib/access";
import { publishPost } from "@/lib/publishing";
import { notifyUser } from "@/lib/push";

export const maxDuration = 60;

/** Publica um post imediatamente nas contas Instagram conectadas. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const denied = (await denyUnlessRole(user, ["admin", "editor", "designer"])) ?? (await denyIfTrialExpired(user.workspaceId));
  if (denied) return denied;

  try {
    const { status, results } = await publishPost(id, user.workspaceId);
    const okCount = results.filter((r) => r.ok).length;

    await db.insert(activityLogs).values({
      workspaceId: user.workspaceId,
      userId: user.id,
      actorName: user.name,
      actorColor: user.avatarColor,
      action: status === "published" ? `publicou um post em ${okCount} conta(s)` : "tentou publicar um post (falhou)",
      entity: "post",
      entityId: id,
    });
    // `notifyUser` grava o registro **e** manda push para os aparelhos — antes
    // isto inseria direto na tabela, então o aviso só aparecia se a pessoa
    // estivesse com o app aberto.
    await notifyUser(user.id, {
      workspaceId: user.workspaceId,
      title: status === "published" ? "Post publicado" : "Falha ao publicar",
      body: results.map((r) => `@${r.account}: ${r.ok ? (r.error ?? "publicado") : r.error}`).join(" · "),
      kind: status === "published" ? "success" : "warning",
      url: "/calendar",
    });

    return NextResponse.json({ ok: status === "published", status, results }, { status: status === "published" ? 200 : 502 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao publicar." }, { status: 400 });
  }
}
