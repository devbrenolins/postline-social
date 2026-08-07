import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { notifyUser } from "@/lib/push";

export const maxDuration = 60;

/**
 * Envio pontual de avisos do app — promoção, cobrança, novidade.
 *
 * Protegida por `ADMIN_SECRET` (header `Authorization: Bearer ...`), não por
 * sessão: quem dispara é você, de fora do app. A rota **exige** o segredo; sem
 * a env configurada ela recusa tudo, para não ficar aberta por descuido.
 *
 * Uso:
 *   curl -X POST https://SEU-APP/api/admin/broadcast \
 *     -H "Authorization: Bearer $ADMIN_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"title":"Black Friday","body":"40% off no plano Pro","url":"/planos","segment":"trial","campaign":"bf-2026"}'
 *
 * Segmentos: "todos" | "trial" | "pagos" | "pro" | "business"
 * `dryRun: true` devolve quantos receberiam, sem enviar nada.
 */
type Segment = "todos" | "trial" | "pagos" | "pro" | "business";

const SEGMENTOS: Segment[] = ["todos", "trial", "pagos", "pro", "business"];

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_SECRET não configurado." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    body?: string;
    url?: string;
    segment?: Segment;
    campaign?: string;
    dryRun?: boolean;
  } | null;

  const title = body?.title?.trim();
  if (!title) return NextResponse.json({ error: "Campo 'title' obrigatório." }, { status: 400 });

  const segment: Segment = body?.segment ?? "todos";
  if (!SEGMENTOS.includes(segment)) {
    return NextResponse.json({ error: `Segmento inválido. Use: ${SEGMENTOS.join(", ")}` }, { status: 400 });
  }

  /**
   * A campanha vira parte da dedupeKey. Isso torna a chamada idempotente: se o
   * curl for repetido (ou der timeout no meio e você tentar de novo), ninguém
   * recebe a mesma promoção duas vezes. Sem `campaign`, não há proteção.
   */
  const campaign = body?.campaign?.trim();

  const alvos = await db
    .select({ id: workspaces.id, ownerId: workspaces.ownerId, plan: workspaces.plan })
    .from(workspaces)
    .where(and(isNull(workspaces.deletedAt), segment === "trial" ? eq(workspaces.plan, "trial")
      : segment === "pro" ? eq(workspaces.plan, "pro")
      : segment === "business" ? eq(workspaces.plan, "business")
      : undefined));

  // "pagos" não é um plano só, então filtra em memória depois da query.
  const filtrados = segment === "pagos" ? alvos.filter((w) => w.plan !== "trial") : alvos;

  if (body?.dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, segment, destinatarios: filtrados.length });
  }

  let enviados = 0;
  for (const ws of filtrados) {
    await notifyUser(ws.ownerId, {
      workspaceId: ws.id,
      title,
      body: body?.body ?? "",
      kind: "info",
      url: body?.url ?? "/planos",
      dedupeKey: campaign ? `campanha:${campaign}:${ws.id}` : undefined,
    });
    enviados += 1;
  }

  return NextResponse.json({ ok: true, segment, enviados });
}
