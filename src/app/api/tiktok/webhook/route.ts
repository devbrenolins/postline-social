import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts, posts } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { notifyUser, notifyWorkspace } from "@/lib/push";
import { verifyWebhookSignature, parseWebhookEvent } from "@/lib/tiktok";

/**
 * Webhook do TikTok.
 *
 * A publicação é assíncrona: `init` só enfileira e o resultado chega aqui. Sem
 * isto o usuário só descobriria o desfecho abrindo o TikTok — ou pelo polling,
 * que segura a requisição e desiste depois de meio minuto.
 *
 * A Meta e o TikTok divergem num ponto importante: aqui é preciso responder
 * 200 **sempre** que a assinatura confere, mesmo para evento que não sabemos
 * tratar. Um erro nosso faria o TikTok reentregar por até 72h.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("tiktok-signature"))) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  const evento = parseWebhookEvent(raw);
  if (!evento) return NextResponse.json({ received: true });

  try {
    await tratar(evento);
  } catch (e) {
    // Falha nossa não pode virar reentrega infinita: registra e confirma.
    console.error("[tiktok/webhook] falha ao tratar evento", evento.event, e);
  }
  return NextResponse.json({ received: true });
}

async function tratar(evento: { event: string; userOpenId: string; shareId: string | null }) {
  if (!evento.userOpenId) return;

  const account = (
    await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.platform, "tiktok"),
          eq(socialAccounts.externalId, evento.userOpenId),
          isNull(socialAccounts.deletedAt)
        )
      )
      .limit(1)
  )[0];
  if (!account) {
    console.warn(`[tiktok/webhook] evento ignorado: nenhuma conta com open_id ${evento.userOpenId}`);
    return;
  }

  const concluiu = evento.event === "video.publish.completed";
  const falhou = evento.event === "video.upload.failed";
  if (!concluiu && !falhou) return;

  // Tenta casar com o post que originou o envio, para o aviso citar a legenda.
  const post = evento.shareId
    ? (
        await db
          .select({ id: posts.id, caption: posts.caption, authorId: posts.authorId })
          .from(posts)
          .where(and(eq(posts.workspaceId, account.workspaceId), sql`${posts.externalMedia}::text ILIKE ${"%" + evento.shareId + "%"}`))
          .limit(1)
      )[0]
    : undefined;

  const trecho = post?.caption ? `"${post.caption.slice(0, 60)}"` : "Seu vídeo";
  const aviso = {
    workspaceId: account.workspaceId,
    title: concluiu ? "Publicado no TikTok" : "Falha no envio ao TikTok",
    body: concluiu
      ? `${trecho} está no ar em @${account.handle}.`
      : `${trecho} não pôde ser enviado para @${account.handle}. Tente novamente.`,
    kind: (concluiu ? "success" : "warning") as "success" | "warning",
    url: "/calendar",
    // O TikTok garante "ao menos uma entrega": o mesmo evento pode chegar duas
    // vezes, e sem chave de deduplicação o usuário receberia dois avisos.
    dedupeKey: `tiktok:${evento.event}:${evento.shareId ?? evento.userOpenId}`,
  };

  if (post?.authorId) await notifyUser(post.authorId, aviso);
  else await notifyWorkspace(aviso);
}
