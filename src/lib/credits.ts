import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiGenerations, creditLedger, workspaces } from "@/db/schema";
import { planOf, type CreditKind, type Plan } from "@/lib/plans";

/**
 * Saldo de créditos de um workspace.
 *
 * São duas fontes somadas:
 *  - a franquia diária do plano, que zera à meia-noite (America/Sao_Paulo);
 *  - os pacotes comprados, que não expiram e só entram quando a franquia acaba.
 *
 * O consumo é medido pelos tokens gastos nas gerações do dia — 100 mil tokens
 * equivalem a 1 crédito Postline.
 */

const TOKENS_PER_CREDIT = 100_000;

export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

export type CreditBucket = {
  kind: CreditKind;
  label: string;
  /** Franquia diária do plano. */
  dailyCredits: number;
  dailyGenerations: number;
  /** Consumido hoje, em créditos. */
  used: number;
  /** Quanto ainda resta da franquia do dia. */
  remainingDaily: number;
  /** Saldo comprado, que não expira. */
  purchased: number;
  /** Franquia restante + saldo comprado. */
  available: number;
  generations: number;
  tokensUsed: number;
};

const LABELS: Record<CreditKind, string> = { script: "roteiros", creative: "criativos" };

async function purchasedBalances(workspaceId: string): Promise<Record<CreditKind, number>> {
  const rows = await db
    .select({ kind: creditLedger.kind, total: sql<string>`coalesce(sum(${creditLedger.amount}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.workspaceId, workspaceId))
    .groupBy(creditLedger.kind);

  const result: Record<CreditKind, number> = { script: 0, creative: 0 };
  for (const row of rows) {
    if (row.kind === "script" || row.kind === "creative") {
      result[row.kind] = Math.max(0, Number(row.total));
    }
  }
  return result;
}

export async function workspacePlan(workspaceId: string): Promise<Plan> {
  const [row] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return planOf(row?.plan);
}

export async function creditSummary(workspaceId: string) {
  const plan = await workspacePlan(workspaceId);
  const start = new Date(`${todayKey()}T00:00:00-03:00`);

  const [rows, purchased] = await Promise.all([
    db
      .select({ kind: aiGenerations.kind, inputTokens: aiGenerations.inputTokens, outputTokens: aiGenerations.outputTokens })
      .from(aiGenerations)
      .where(and(eq(aiGenerations.workspaceId, workspaceId), inArray(aiGenerations.kind, ["script", "creative"]), gte(aiGenerations.createdAt, start))),
    purchasedBalances(workspaceId),
  ]);

  const bucket = (kind: CreditKind): CreditBucket => {
    const matching = rows.filter((row) => row.kind === kind);
    const tokensUsed = matching.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0);
    const used = tokensUsed / TOKENS_PER_CREDIT;
    const dailyCredits = plan.limits.dailyCredits[kind];
    const remainingDaily = Math.max(0, dailyCredits - used);
    return {
      kind,
      label: LABELS[kind],
      dailyCredits,
      dailyGenerations: plan.limits.dailyGenerations[kind],
      used,
      remainingDaily,
      purchased: purchased[kind],
      available: remainingDaily + purchased[kind],
      generations: matching.length,
      tokensUsed,
    };
  };

  return { plan: { id: plan.id, name: plan.name }, script: bucket("script"), creative: bucket("creative") };
}

/** Reserva mínima exigida antes de iniciar uma geração, em créditos. */
const RESERVE: Record<CreditKind, number> = { script: 0.025, creative: 0.15 };

export async function assertCreditAllowance(workspaceId: string, kind: CreditKind) {
  const summary = await creditSummary(workspaceId);
  const bucket = summary[kind];

  if (bucket.generations >= bucket.dailyGenerations) {
    throw new Error(
      `Limite diário de ${bucket.dailyGenerations} ${bucket.label} atingido no plano ${summary.plan.name}. Faça upgrade ou aguarde a renovação à meia-noite.`
    );
  }
  if (bucket.available < RESERVE[kind]) {
    throw new Error(
      `Saldo insuficiente para gerar ${bucket.label}. Restam ${bucket.available.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} créditos — compre um pacote ou faça upgrade.`
    );
  }
}

/**
 * Lança no razão o que passou da franquia diária.
 *
 * Chamado depois da geração, quando já se sabe o custo real em tokens. Só gera
 * linha negativa se o consumo do dia ultrapassou a franquia do plano.
 */
export async function chargeOverflow(workspaceId: string, kind: CreditKind, creditsSpent: number) {
  if (creditsSpent <= 0) return;

  const plan = await workspacePlan(workspaceId);
  const start = new Date(`${todayKey()}T00:00:00-03:00`);
  const rows = await db
    .select({ inputTokens: aiGenerations.inputTokens, outputTokens: aiGenerations.outputTokens })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, kind), gte(aiGenerations.createdAt, start)));

  const usedTotal = rows.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0) / TOKENS_PER_CREDIT;
  const daily = plan.limits.dailyCredits[kind];
  const usedBefore = Math.max(0, usedTotal - creditsSpent);

  // Só a parte que passou da franquia sai do saldo comprado.
  const overflow = Math.max(0, usedTotal - Math.max(daily, usedBefore));
  if (overflow <= 0) return;

  await db.insert(creditLedger).values({
    workspaceId,
    kind,
    amount: (-overflow).toFixed(3),
    reason: "consumo_acima_da_franquia",
  });
}
