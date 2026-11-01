import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { and, eq, isNull, lte } from "drizzle-orm";
import { publishPost } from "@/lib/publishing";
import { notifyUser, notifyWorkspace } from "@/lib/push";
import { trialState } from "@/lib/credits";

export const maxDuration = 60;

/**
 * Worker de publicação agendada. Chame periodicamente (ex.: Vercel Cron a cada
 * minuto) com o header `Authorization: Bearer <CRON_SECRET>`.
 * Publica todos os posts com status "scheduled" cujo horário já chegou.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Fail-closed: sem CRON_SECRET configurado a rota recusa tudo.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const due = await db
    .select({ id: posts.id, workspaceId: posts.workspaceId, authorId: posts.authorId })
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date()), isNull(posts.deletedAt)))
    .limit(50);

  const summary: { id: string; status: string; error?: string }[] = [];
  const expiredCache = new Map<string, boolean>();
  for (const post of due) {
    try {
      // Teste vencido: o post fica agendado (não é perdido), mas não publica.
      if (!expiredCache.has(post.workspaceId)) expiredCache.set(post.workspaceId, (await trialState(post.workspaceId)).expired);
      if (expiredCache.get(post.workspaceId)) {
        summary.push({ id: post.id, status: "skipped_trial_expired" });
        continue;
      }
      const { status, results } = await publishPost(post.id, post.workspaceId);
      summary.push({ id: post.id, status });
      const ok = status === "published";
      const aviso = {
        workspaceId: post.workspaceId,
        title: ok ? "Post agendado publicado" : "Falha na publicação agendada",
        body: results.map((r) => `@${r.account}: ${r.ok ? "ok" : r.error}`).join(" · "),
        kind: (ok ? "success" : "warning") as "success" | "warning",
        url: "/calendar",
      };
      // Só quem agendou é avisado. Posts antigos sem autor (author_id nulo, ex.:
      // membro removido) caem no aviso do workspace para não sumirem.
      if (post.authorId) await notifyUser(post.authorId, aviso);
      else await notifyWorkspace(aviso);
    } catch (e) {
      summary.push({ id: post.id, status: "failed", error: e instanceof Error ? e.message : "erro" });
    }
  }

  return NextResponse.json({ ok: true, processed: summary.length, summary });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
