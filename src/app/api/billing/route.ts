import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs, creditLedger, creditPurchases, workspaceMembers, workspaces } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { creditSummary } from "@/lib/credits";
import { CREDIT_PACKS, PLANS, PLAN_ORDER, isPlanId, packById } from "@/lib/plans";

export const maxDuration = 30;

/**
 * Planos e compra de créditos.
 *
 * ATENÇÃO: não há cobrança real. `confirmPurchase` apenas marca a compra como
 * paga e credita o saldo — é o ponto exato onde o webhook de um provedor de
 * pagamento entraria. Enquanto isso, a ação fica restrita a administradores
 * para não virar crédito grátis para qualquer membro.
 */

async function requireAdmin(workspaceId: string, userId: string) {
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return membership?.role === "admin";
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const [ws] = await db
    .select({ plan: workspaces.plan, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, user.workspaceId))
    .limit(1);

  const [credits, purchases, isAdmin] = await Promise.all([
    creditSummary(user.workspaceId),
    db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.workspaceId, user.workspaceId))
      .orderBy(desc(creditPurchases.createdAt))
      .limit(20),
    requireAdmin(user.workspaceId, user.id),
  ]);

  return NextResponse.json({
    workspace: { name: ws?.name ?? "", plan: ws?.plan ?? "free" },
    plans: PLAN_ORDER.map((id) => PLANS[id]),
    packs: CREDIT_PACKS,
    credits,
    purchases,
    isAdmin,
    // Deixa explícito para a interface que nada é cobrado de verdade ainda.
    simulated: true,
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await requireAdmin(user.workspaceId, user.id))) {
    return NextResponse.json({ error: "Apenas administradores podem alterar plano e créditos." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "changePlan") {
    const plan = String(body.plan ?? "");
    if (!isPlanId(plan)) return NextResponse.json({ error: "Plano inválido." }, { status: 400 });

    await db.update(workspaces).set({ plan, updatedAt: new Date() }).where(eq(workspaces.id, user.workspaceId));
    await db.insert(activityLogs).values({
      workspaceId: user.workspaceId,
      userId: user.id,
      actorName: user.name,
      actorColor: user.avatarColor,
      action: `alterou o plano para ${PLANS[plan].name}`,
      entity: "workspace",
      entityId: user.workspaceId,
    });

    return NextResponse.json({ ok: true, plan, credits: await creditSummary(user.workspaceId) });
  }

  if (action === "startPurchase") {
    const pack = packById(String(body.packId ?? ""));
    if (!pack) return NextResponse.json({ error: "Pacote inválido." }, { status: 400 });

    const [purchase] = await db
      .insert(creditPurchases)
      .values({
        workspaceId: user.workspaceId,
        userId: user.id,
        packId: pack.id,
        kind: pack.kind,
        credits: pack.credits.toFixed(3),
        amountCents: pack.priceCents,
        status: "pending",
        provider: "simulado",
      })
      .returning();

    return NextResponse.json({ purchase });
  }

  if (action === "confirmPurchase") {
    const purchaseId = String(body.purchaseId ?? "");
    const [purchase] = await db
      .select()
      .from(creditPurchases)
      .where(and(eq(creditPurchases.id, purchaseId), eq(creditPurchases.workspaceId, user.workspaceId)))
      .limit(1);

    if (!purchase) return NextResponse.json({ error: "Compra não encontrada." }, { status: 404 });
    if (purchase.status === "paid") return NextResponse.json({ error: "Esta compra já foi confirmada." }, { status: 409 });

    await db
      .update(creditPurchases)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(creditPurchases.id, purchase.id));

    await db.insert(creditLedger).values({
      workspaceId: user.workspaceId,
      kind: purchase.kind,
      amount: purchase.credits,
      reason: "compra_de_pacote",
      purchaseId: purchase.id,
    });

    return NextResponse.json({ ok: true, credits: await creditSummary(user.workspaceId) });
  }

  if (action === "cancelPurchase") {
    await db
      .update(creditPurchases)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(creditPurchases.id, String(body.purchaseId ?? "")),
          eq(creditPurchases.workspaceId, user.workspaceId),
          eq(creditPurchases.status, "pending")
        )
      );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
