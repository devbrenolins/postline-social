/**
 * Notificações: grava no histórico in-app (tabela `notifications`) e entrega
 * como Web Push nos dispositivos inscritos.
 *
 * Regra do módulo: nenhuma falha de push derruba a operação que a originou.
 * Publicar um post é o trabalho; avisar é efeito colateral. Todo envio é
 * best-effort e os erros viram log.
 */
import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications, pushSubscriptions, workspaceMembers } from "@/db/schema";

export type NotificationKind = "info" | "success" | "warning";

export type NotificationInput = {
  workspaceId: string;
  title: string;
  body?: string;
  kind?: NotificationKind;
  /** Caminho aberto ao tocar na push. Padrão: /dashboard */
  url?: string;
  /**
   * Torna a notificação idempotente. Com a mesma chave, uma segunda inserção é
   * ignorada — indispensável para avisos disparados por cron recorrente.
   */
  dedupeKey?: string;
};

/* ------------------------------------------------------------------ */
/*  Configuração VAPID                                                 */
/* ------------------------------------------------------------------ */

let configured: boolean | null = null;

/** Configura o VAPID uma vez por processo. `false` = push desligado (sem chaves). */
function ensureVapid(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contato@postline.social", publicKey, privateKey);
  configured = true;
  return true;
}

/* ------------------------------------------------------------------ */
/*  Entrega                                                            */
/* ------------------------------------------------------------------ */

type PushPayload = { title: string; body: string; url: string; kind: NotificationKind };

/**
 * Envia a um conjunto de usuários. Inscrições recusadas com 404/410 são
 * removidas: o push service usa esses códigos para dizer "esse dispositivo não
 * existe mais" (app desinstalado, permissão revogada). Sem a limpeza a tabela
 * acumula endpoints mortos e cada envio fica mais lento.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0 || !ensureVapid()) return 0;

  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, ids));
  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  const alive: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      const target: WebPushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        // TTL de 24h: se o aparelho estiver desligado, o push service segura a
        // mensagem por um dia. Passou disso, o aviso já não é útil.
        await webpush.sendNotification(target, body, { TTL: 60 * 60 * 24, urgency: "normal" });
        alive.push(sub.endpoint);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(sub.endpoint);
        else console.error("[push] falha ao enviar", sub.endpoint.slice(0, 48), status ?? e);
      }
    })
  );

  // Um UPDATE e um DELETE por lote, não por endpoint.
  if (dead.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, dead)).catch(() => {});
  }
  if (alive.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: new Date() })
      .where(inArray(pushSubscriptions.endpoint, alive))
      .catch(() => {});
  }
  return alive.length;
}

/* ------------------------------------------------------------------ */
/*  API de alto nível                                                  */
/* ------------------------------------------------------------------ */

/**
 * Notifica **um** usuário: grava o registro só para ele e faz push nos
 * dispositivos dele. Use quando o aviso é pessoal ("seu post publicou").
 */
export async function notifyUser(userId: string, input: NotificationInput): Promise<void> {
  const url = input.url ?? "/dashboard";
  const kind = input.kind ?? "info";
  try {
    const inserted = await db
      .insert(notifications)
      .values({
        workspaceId: input.workspaceId,
        userId,
        title: input.title,
        body: input.body ?? "",
        kind,
        url,
        dedupeKey: input.dedupeKey ?? null,
      })
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning({ id: notifications.id });

    // Nada inserido = a dedupeKey já existia; o usuário já foi avisado antes.
    if (input.dedupeKey && inserted.length === 0) return;

    await sendPushToUsers([userId], { title: input.title, body: input.body ?? "", url, kind });
  } catch (e) {
    console.error("[push] notifyUser", e);
  }
}

/**
 * Notifica o workspace inteiro: um registro visível a todos os membros e push
 * para cada membro ativo. Use em avisos que são do time, não de uma pessoa.
 */
export async function notifyWorkspace(input: NotificationInput): Promise<void> {
  const url = input.url ?? "/dashboard";
  const kind = input.kind ?? "info";
  try {
    const inserted = await db
      .insert(notifications)
      .values({
        workspaceId: input.workspaceId,
        title: input.title,
        body: input.body ?? "",
        kind,
        url,
        dedupeKey: input.dedupeKey ?? null,
      })
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning({ id: notifications.id });

    if (input.dedupeKey && inserted.length === 0) return;

    const members = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          eq(workspaceMembers.status, "active"),
          isNull(workspaceMembers.deletedAt)
        )
      );

    const ids = members.map((m) => m.userId).filter((id): id is string => Boolean(id));
    await sendPushToUsers(ids, { title: input.title, body: input.body ?? "", url, kind });
  } catch (e) {
    console.error("[push] notifyWorkspace", e);
  }
}

/** `true` quando o servidor tem chaves VAPID — a UI usa para não oferecer algo morto. */
export function pushConfigured(): boolean {
  return ensureVapid();
}
