/**
 * Planos e pacotes de créditos.
 *
 * O checkout é simulado: nenhuma cobrança real acontece. Os limites abaixo,
 * porém, são aplicados de verdade — quem está no gratuito gera menos.
 * Ao plugar um provedor de pagamento, só o passo de confirmação muda.
 */

export type PlanId = "trial" | "pro" | "business";

/** Dias de teste completo concedidos a todo workspace novo. */
export const TRIAL_DAYS = 7;
export type CreditKind = "script" | "creative";

export type PlanLimits = {
  /** Créditos Postline por dia, por tipo de geração. */
  dailyCredits: Record<CreditKind, number>;
  /** Teto de gerações por dia, mesmo que sobre crédito. */
  dailyGenerations: Record<CreditKind, number>;
  clients: number;
  members: number;
  socialAccounts: number;
};

export type Plan = {
  id: PlanId;
  name: string;
  priceCents: number;
  tagline: string;
  highlights: string[];
  limits: PlanLimits;
};

/** `Infinity` não sobrevive a JSON.stringify — usamos um sentinela. */
export const UNLIMITED = -1;

export const PLANS: Record<PlanId, Plan> = {
  // Teste: mesmos limites do Pro, mas com prazo. Não existe plano gratuito
  // permanente — quando o prazo acaba, é preciso assinar.
  trial: {
    id: "trial",
    name: "Teste grátis",
    priceCents: 0,
    tagline: `${TRIAL_DAYS} dias com tudo do Pro liberado.`,
    highlights: [`${TRIAL_DAYS} dias sem pagar`, "Todos os recursos do Pro", "Sem cartão para começar"],
    limits: {
      dailyCredits: { script: 1, creative: 2 },
      dailyGenerations: { script: 20, creative: 8 },
      clients: 10,
      members: 5,
      socialAccounts: 15,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceCents: 9700,
    tagline: "Para quem atende vários clientes.",
    highlights: ["10 clientes", "15 contas sociais", "Equipe de até 5 pessoas"],
    limits: {
      dailyCredits: { script: 1, creative: 2 },
      dailyGenerations: { script: 20, creative: 8 },
      clients: 10,
      members: 5,
      socialAccounts: 15,
    },
  },
  business: {
    id: "business",
    name: "Business",
    priceCents: 24700,
    tagline: "Para agências com time e volume.",
    highlights: ["Clientes ilimitados", "Contas ilimitadas", "Equipe ilimitada"],
    limits: {
      dailyCredits: { script: 4, creative: 8 },
      dailyGenerations: { script: 80, creative: 40 },
      clients: UNLIMITED,
      members: UNLIMITED,
      socialAccounts: UNLIMITED,
    },
  },
};

export const PLAN_ORDER: PlanId[] = ["trial", "pro", "business"];

/** Planos que o cliente pode assinar (o teste não é assinável). */
export const PAID_PLANS: PlanId[] = ["pro", "business"];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in PLANS;
}

/** Workspaces com plano desconhecido (ex.: o antigo "free") caem no teste. */
export function planOf(value: string | null | undefined): Plan {
  return isPlanId(value) ? PLANS[value] : PLANS.trial;
}

/** Plano sugerido quando alguém esbarra num limite. */
export function recommendedUpgrade(current: PlanId): Plan | null {
  if (current === "business") return null;
  return current === "pro" ? PLANS.business : PLANS.pro;
}

export function isUnlimited(limit: number) {
  return limit === UNLIMITED;
}

export function withinLimit(current: number, limit: number) {
  return isUnlimited(limit) || current < limit;
}

/* ------------------------------- Créditos ------------------------------- */

export type CreditPack = {
  id: string;
  name: string;
  kind: CreditKind;
  credits: number;
  priceCents: number;
};

/**
 * Pacotes avulsos. Diferente do saldo diário do plano, estes não expiram —
 * ficam no saldo do workspace até serem consumidos.
 */
export const CREDIT_PACKS: CreditPack[] = [
  { id: "script-10", name: "10 créditos de roteiro", kind: "script", credits: 10, priceCents: 1900 },
  { id: "script-30", name: "30 créditos de roteiro", kind: "script", credits: 30, priceCents: 4900 },
  { id: "creative-10", name: "10 créditos de criativo", kind: "creative", credits: 10, priceCents: 2900 },
  { id: "creative-30", name: "30 créditos de criativo", kind: "creative", credits: 30, priceCents: 6900 },
];

export function packById(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.id === id);
}

export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
