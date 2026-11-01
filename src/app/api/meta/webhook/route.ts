import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { directAutomations, socialAccounts, inboxItems, notifications, posts } from "@/db/schema";
import { verifyMetaSignature } from "@/lib/meta";
import { sendCommentPrivateReply, sendDirectMessage } from "@/lib/instagram";

/**
 * Descobre a publicação do Postline a partir do id de mídia do Instagram.
 *
 * `posts.externalMedia` guarda um par por conta publicada, então o casamento é
 * feito em JSON — a lista por workspace é pequena e só roda quando existe
 * comentário com mídia.
 */
async function findPostByExternalMedia(workspaceId: string, mediaId: string) {
  const rows = await db
    .select({ id: posts.id, externalMedia: posts.externalMedia })
    .from(posts)
    .where(and(eq(posts.workspaceId, workspaceId), isNull(posts.deletedAt), eq(posts.status, "published")));
  return rows.find((row) => (row.externalMedia ?? []).some((entry) => entry.mediaId === mediaId)) ?? null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verificação inválida." }, { status: 403 });
}

type Messaging = { sender?: { id?: string }; message?: { text?: string; is_echo?: boolean } };
type CommentValue = {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
};
type Change = { field?: string; value?: CommentValue };
type Entry = { id?: string; messaging?: Messaging[]; changes?: Change[] };

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let payload: { entry?: Entry[] };
  try {
    payload = JSON.parse(raw) as { entry?: Entry[] };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    const igId = entry.id;
    if (!igId) continue;

    // Descobre a conta (workspace + token) que recebeu a mensagem.
    //
    // O `entry.id` pode vir como ID da conta profissional **ou** como ID
    // app-scoped, dependendo do evento — são números diferentes para a mesma
    // conta. Casar só por um deles fazia o webhook devolver 200 e descartar o
    // evento em silêncio: a Meta via sucesso e nunca reenviava.
    const account = (
      await db
        .select()
        .from(socialAccounts)
        .where(
          and(
            or(eq(socialAccounts.externalId, igId), eq(socialAccounts.appScopedId, igId)),
            eq(socialAccounts.connected, true),
            isNull(socialAccounts.deletedAt)
          )
        )
        .limit(1)
    )[0];
    if (!account?.accessToken) {
      // Evento para uma conta que não conhecemos. Acontece com o payload de
      // exemplo do botão "Teste" da Meta (IDs fictícios) e aconteceria de novo
      // se surgir um terceiro tipo de ID — antes isso sumia sem deixar rastro,
      // com HTTP 200, o que torna o diagnóstico quase impossível.
      console.warn(`[meta/webhook] evento ignorado: nenhuma conta conectada com o id ${igId}`);
      continue;
    }

    // Guarda o ID que a Meta usou, para a conta passar a casar pelos dois.
    if (igId !== account.externalId && account.appScopedId !== igId) {
      await db.update(socialAccounts).set({ appScopedId: igId, updatedAt: new Date() }).where(eq(socialAccounts.id, account.id));
    }

    const rules = await db
      .select()
      .from(directAutomations)
      .where(and(eq(directAutomations.workspaceId, account.workspaceId), eq(directAutomations.active, true), isNull(directAutomations.deletedAt)));

    // ---- Comentários (entry.changes com field "comments") ----
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const c = change.value ?? {};
      const commentText = (c.text ?? "").trim();
      if (!commentText) continue;
      // Não notifica o comentário/resposta feito pela própria conta.
      if (c.from?.id && c.from.id === igId) continue;

      const username = c.from?.username || c.from?.id || "alguém";
      // Guarda a origem: sem o id do comentário e a conta, a resposta da caixa
      // de entrada não tem como sair no Instagram.
      await db
        .insert(inboxItems)
        .values({
          workspaceId: account.workspaceId,
          socialAccountId: account.id,
          platform: "instagram",
          type: "comment",
          authorName: username,
          authorHandle: username,
          text: commentText,
          postPreview: c.media?.id ? `Mídia ${c.media.id}` : "",
          externalId: c.id ?? null,
          externalMediaId: c.media?.id ?? null,
          status: "unread",
        })
        .onConflictDoNothing({ target: [inboxItems.workspaceId, inboxItems.externalId] });
      await db.insert(notifications).values({
        workspaceId: account.workspaceId,
        title: `Novo comentário de @${username}`,
        body: commentText.slice(0, 180),
        kind: "info",
      });

      // ---- Automação "comente X, receba no direct" ----
      // Só entram regras vinculadas justamente à publicação comentada.
      const mediaId = c.media?.id;
      const commentId = c.id;
      if (!mediaId || !commentId) continue;

      const post = await findPostByExternalMedia(account.workspaceId, mediaId);
      if (!post) continue;

      const lowered = commentText.toLowerCase();
      const rule = rules.find(
        (item) => item.postId === post.id && item.triggerKeywords.some((k) => lowered.includes(k.toLowerCase()))
      );
      if (!rule) continue;

      try {
        await sendCommentPrivateReply(igId, account.accessToken, commentId, rule.responseTemplate);
        await db
          .update(directAutomations)
          .set({ sentCount: sql`${directAutomations.sentCount} + 1`, lastSentAt: new Date(), updatedAt: new Date() })
          .where(eq(directAutomations.id, rule.id));
      } catch {
        // Resposta privada já usada neste comentário, fora dos 7 dias ou sem permissão.
      }
    }

    // ---- Mensagens diretas (entry.messaging) ----
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const text = event.message?.text?.toLowerCase().trim();
      if (!senderId || !text || event.message?.is_echo) continue;

      // Registra a mensagem na caixa de entrada.
      await db
        .insert(inboxItems)
        .values({
          workspaceId: account.workspaceId,
          socialAccountId: account.id,
          platform: "instagram",
          type: "message",
          authorName: senderId,
          authorHandle: senderId,
          text: event.message?.text ?? "",
          // Em direct, responder é mandar para o remetente — é ele o destino.
          externalId: senderId,
          status: "unread",
        })
        .onConflictDoUpdate({
          target: [inboxItems.workspaceId, inboxItems.externalId],
          set: { text: event.message?.text ?? "", status: "unread", updatedAt: new Date() },
        });
      await db.insert(notifications).values({
        workspaceId: account.workspaceId,
        title: "Nova mensagem no Instagram",
        body: (event.message?.text ?? "").slice(0, 180),
        kind: "info",
      });

      // Regras presas a uma publicação só valem no fluxo de comentário — num
      // direct solto não há como saber de qual post a pessoa veio.
      const rule = rules.find((item) => !item.postId && item.triggerKeywords.some((k) => text.includes(k.toLowerCase())));
      if (!rule) continue;
      try {
        await sendDirectMessage(igId, account.accessToken, senderId, rule.responseTemplate);
        await db
          .update(directAutomations)
          .set({ sentCount: sql`${directAutomations.sentCount} + 1`, lastSentAt: new Date(), updatedAt: new Date() })
          .where(eq(directAutomations.id, rule.id));
      } catch {
        // Fora da janela de 24h ou sem permissão — ignora silenciosamente.
      }
    }
  }

  return NextResponse.json({ received: true });
}
