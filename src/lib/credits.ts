import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiGenerations, creditLedger, workspaces } from "@/db/schema";
import { planOf, recommendedUpgrade, TRIAL_DAYS, type CreditKind, type Plan } from "@/lib/plans";

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

export type TrialState = {
  /** O workspace está num teste (expirado ou não). */
  isTrial: boolean;
  endsAt: string | null;
  daysLeft: number;
  expired: boolean;
};

export async function workspacePlan(workspaceId: string): Promise<Plan> {
  const [row] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return planOf(row?.plan);
}

/**
 * Situação do teste gratuito.
 *
 * Workspaces criados antes desta coluna existir têm `trialEndsAt` nulo — nesses
 * casos o prazo é derivado da data de criação, para nunca ficar sem validade.
 */
export async function trialState(workspaceId: string): Promise<TrialState> {
  const [row] = await db
    .select({ plan: workspaces.plan, trialEndsAt: workspaces.trialEndsAt, createdAt: workspaces.createdAt })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!row || row.plan !== "trial") {
    return { isTrial: false, endsAt: null, daysLeft: 0, expired: false };
  }

  const ends = row.trialEndsAt ?? new Date(row.createdAt.getTime() + TRIAL_DAYS * 86_400_000);
  const msLeft = ends.getTime() - Date.now();
  return {
    isTrial: true,
    endsAt: ends.toISOString(),
    daysLeft: Math.max(0, Math.ceil(msLeft / 86_400_000)),
    expired: msLeft <= 0,
  };
}

/** Fração do saldo abaixo da qual a interface começa a avisar. */
export const LOW_BALANCE_RATIO = 0.2;

export async function creditSummary(workspaceId: string) {
  const plan = await workspacePlan(workspaceId);
  const trial = await trialState(workspaceId);
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

  const script = bucket("script");
  const creative = bucket("creative");
  const upgrade = recommendedUpgrade(plan.id);

  /** Já dá para a interface decidir o que mostrar sem repetir esta conta. */
  const low = (b: CreditBucket) => b.dailyCredits > 0 && b.available <= b.dailyCredits * LOW_BALANCE_RATIO;

  return {
    plan: { id: plan.id, name: plan.name },
    trial,
    script,
    creative,
    lowBalance: trial.expired || low(script) || low(creative),
    blocked: trial.expired || (script.available <= 0 && creative.available <= 0),
    upgrade: upgrade ? { id: upgrade.id, name: upgrade.name, priceCents: upgrade.priceCents } : null,
  };
}

/** Reserva mínima exigida antes de iniciar uma geração, em créditos. */
const RESERVE: Record<CreditKind, number> = { script: 0.025, creative: 0.15 };

/**
 * Erro de limite atingido.
 *
 * Carrega o plano sugerido para a interface abrir a tela de assinatura já no
 * lugar certo, em vez de só dizer "não pode".
 */
export class CreditLimitError extends Error {
  constructor(message: string, readonly reason: "trial_expired" | "generations" | "balance", readonly upgradeTo: string | null) {
    super(message);
    this.name = "CreditLimitError";
  }
}

export async function assertCreditAllowance(workspaceId: string, kind: CreditKind) {
  const summary = await creditSummary(workspaceId);
  const bucket = summary[kind];
  const upgradeTo = summary.upgrade?.id ?? null;

  if (summary.trial.expired) {
    throw new CreditLimitError(
      `Seus ${TRIAL_DAYS} dias de teste terminaram. Assine para continuar criando com IA.`,
      "trial_expired",
      upgradeTo
    );
  }

  if (bucket.generations >= bucket.dailyGenerations) {
    throw new CreditLimitError(
      `Você usou as ${bucket.dailyGenerations} gerações de ${bucket.label} de hoje no plano ${summary.plan.name}. Faça upgrade para continuar agora ou aguarde a renovação à meia-noite.`,
      "generations",
      upgradeTo
    );
  }

  if (bucket.available < RESERVE[kind]) {
    throw new CreditLimitError(
      `Seu saldo de ${bucket.label} acabou. Compre um pacote avulso ou faça upgrade para voltar a gerar agora.`,
      "balance",
      upgradeTo
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
