import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, notifications } from "@/db/schema";
import { and, eq, isNull, lte } from "drizzle-orm";
import { publishPost } from "@/lib/publishing";

/**
 * Worker de publicação agendada. Chame periodicamente (ex.: Vercel Cron a cada
 * minuto) com o header `Authorization: Bearer <CRON_SECRET>`.
 * Publica todos os posts com status "scheduled" cujo horário já chegou.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const due = await db
    .select({ id: posts.id, workspaceId: posts.workspaceId })
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date()), isNull(posts.deletedAt)))
    .limit(50);

  const summary: { id: string; status: string; error?: string }[] = [];
  for (const post of due) {
    try {
      const { status, results } = await publishPost(post.id, post.workspaceId);
      summary.push({ id: post.id, status });
      await db.insert(notifications).values({
        workspaceId: post.workspaceId,
        title: status === "published" ? "Post agendado publicado" : "Falha na publicação agendada",
        body: results.map((r) => `@${r.account}: ${r.ok ? "ok" : r.error}`).join(" · "),
        kind: status === "published" ? "success" : "warning",
      });
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
