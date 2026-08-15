import { db } from "@/db";
import { inboxItems, socialAccounts } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getMediaComments, getConversations, getConversationMessages, type Conversation } from "@/lib/instagram";
import { getWorkspaceMedia } from "@/lib/ig-media";

const TTL_MS = 5 * 60 * 1000;
/** Publicações vasculhadas por passada (as mais recentes com comentário). */
const MAX_MEDIA = 12;
/** Conversas de direct lidas por passada. */
const MAX_THREADS = 15;

const lastSync = new Map<string, number>();

type NewItem = typeof inboxItems.$inferInsert;

/**
 * Traz para a caixa de entrada o que já existia no Instagram.
 *
 * O webhook só entrega o que chega **depois** de a conta ser conectada — quem
 * instala o Postline hoje começa com a caixa vazia mesmo tendo conversas e
 * comentários antigos. Aqui esse histórico é lido sob demanda e casado por
 * `externalId`, então reimportar não duplica.
 */
export async function syncWorkspaceInbox(workspaceId: string, opts: { force?: boolean } = {}): Promise<number> {
  const at = lastSync.get(workspaceId);
  if (!opts.force && at && Date.now() - at < TTL_MS) return 0;
  lastSync.set(workspaceId, Date.now());

  const accounts = (
    await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, workspaceId),
          eq(socialAccounts.platform, "instagram"),
          eq(socialAccounts.connected, true),
          isNull(socialAccounts.deletedAt)
        )
      )
  ).filter((a) => a.externalId && a.accessToken);
  if (accounts.length === 0) return 0;

  const rows: NewItem[] = [];

  // --- Comentários das publicações recentes ---
  // Reaproveita a listagem já em cache: sem isso seriam mais 25 chamadas.
  const { media } = await getWorkspaceMedia(workspaceId).catch(() => ({ media: [] }));
  const commented = media.filter((m) => m.comments > 0).slice(0, MAX_MEDIA);

  for (const account of accounts) {
    const token = account.accessToken!;
    const mine = commented.filter((m) => m.account === account.handle);

    for (const m of mine) {
      let comments;
      try {
        comments = await getMediaComments(m.id, token);
      } catch {
        continue; // mídia sem permissão de leitura de comentários
      }
      for (const c of comments) {
        // Comentário do próprio perfil não é item de caixa de entrada.
        if (c.username && c.username === account.handle) continue;
        rows.push({
          workspaceId,
          socialAccountId: account.id,
          platform: "instagram",
          type: "comment",
          authorName: c.username || "alguém",
          authorHandle: c.username || "",
          text: c.text,
          postPreview: m.caption.slice(0, 140),
          externalId: c.id,
          externalMediaId: m.id,
          permalink: m.permalink,
          hidden: c.hidden,
          status: "unread",
          createdAt: c.timestamp ? new Date(c.timestamp) : new Date(),
        });
      }
    }

    // --- Conversas de direct ---
    let threads: Conversation[] = [];
    try {
      threads = await getConversations(account.externalId!, token, MAX_THREADS);
    } catch {
      // Conta sem permissão de mensagens ou sem conversas.
    }
    for (const thread of threads) {
      const other = thread.participants.find((p) => p.username !== account.handle) ?? thread.participants[0];
      let messages;
      try {
        messages = await getConversationMessages(thread.id, token, 10);
      } catch {
        continue;
      }
      for (const msg of messages) {
        if (!msg.text) continue;
        if (msg.from === account.handle) continue; // resposta nossa
        rows.push({
          workspaceId,
          socialAccountId: account.id,
          platform: "instagram",
          type: "message",
          authorName: other?.username || msg.from || "alguém",
          authorHandle: other?.username || "",
          text: msg.text,
          externalId: msg.id,
          status: "unread",
          createdAt: msg.createdTime ? new Date(msg.createdTime) : new Date(),
        });
      }
    }
  }

  if (rows.length === 0) return 0;

  // `externalId` é único por workspace: reimportar atualiza o texto/estado em
  // vez de criar uma segunda cópia. `status` fica de fora — quem já leu, leu.
  await db
    .insert(inboxItems)
    .values(rows)
    .onConflictDoUpdate({
      target: [inboxItems.workspaceId, inboxItems.externalId],
      set: {
        text: sql`excluded.text`,
        hidden: sql`excluded.hidden`,
        permalink: sql`excluded.permalink`,
        updatedAt: new Date(),
      },
    });
  return rows.length;
}
