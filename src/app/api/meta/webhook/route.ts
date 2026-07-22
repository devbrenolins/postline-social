import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { directAutomations, socialAccounts, inboxItems, notifications } from "@/db/schema";
import { verifyMetaSignature } from "@/lib/meta";
import { sendDirectMessage } from "@/lib/instagram";

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

  const payload = JSON.parse(raw) as { entry?: Entry[] };

  for (const entry of payload.entry ?? []) {
    const igId = entry.id;
    if (!igId) continue;

    // Descobre a conta (workspace + token) que recebeu a mensagem.
    const account = (
      await db
        .select()
        .from(socialAccounts)
        .where(and(eq(socialAccounts.externalId, igId), eq(socialAccounts.connected, true), isNull(socialAccounts.deletedAt)))
        .limit(1)
    )[0];
    if (!account?.accessToken) continue;

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
      await db.insert(inboxItems).values({
        workspaceId: account.workspaceId,
        platform: "instagram",
        type: "comment",
        authorName: username,
        authorHandle: username,
        text: commentText,
        postPreview: c.media?.id ? `Mídia ${c.media.id}` : "",
        status: "unread",
      });
      await db.insert(notifications).values({
        workspaceId: account.workspaceId,
        title: `Novo comentário de @${username}`,
        body: commentText.slice(0, 180),
        kind: "info",
      });
    }

    // ---- Mensagens diretas (entry.messaging) ----
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const text = event.message?.text?.toLowerCase().trim();
      if (!senderId || !text || event.message?.is_echo) continue;

      // Registra a mensagem na caixa de entrada.
      await db.insert(inboxItems).values({
        workspaceId: account.workspaceId,
        platform: "instagram",
        type: "message",
        authorName: senderId,
        authorHandle: senderId,
        text: event.message?.text ?? "",
        status: "unread",
      });
      await db.insert(notifications).values({
        workspaceId: account.workspaceId,
        title: "Nova mensagem no Instagram",
        body: (event.message?.text ?? "").slice(0, 180),
        kind: "info",
      });

      const rule = rules.find((item) => item.triggerKeywords.some((k) => text.includes(k.toLowerCase())));
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
