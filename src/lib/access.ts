import { NextResponse } from "next/server";
import { and, eq, isNull, count } from "drizzle-orm";
import { db } from "@/db";
import { clients, socialAccounts, workspaceMembers } from "@/db/schema";
import { trialState, workspacePlan } from "@/lib/credits";
import { isUnlimited, type PlanLimits } from "@/lib/plans";

export type Role = "admin" | "editor" | "designer" | "client";

/** Papel ativo do usuário no workspace, ou null se não for membro. */
export async function roleOf(workspaceId: string, userId: string): Promise<Role | null> {
  const [m] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
        isNull(workspaceMembers.deletedAt)
      )
    )
    .limit(1);
  return (m?.role as Role | undefined) ?? null;
}

/**
 * Exige um dos papéis. Devolve uma resposta 403 pronta para retornar da rota,
 * ou null quando a pessoa pode seguir.
 */
export async function denyUnlessRole(
  user: { id: string; workspaceId: string },
  allowed: Role[]
): Promise<NextResponse | null> {
  const role = await roleOf(user.workspaceId, user.id);
  if (role && allowed.includes(role)) return null;
  return NextResponse.json({ error: "Você não tem permissão para esta ação." }, { status: 403 });
}

/** Bloqueia ações de escrita quando o teste gratuito acabou. */
export async function denyIfTrialExpired(workspaceId: string): Promise<NextResponse | null> {
  const trial = await trialState(workspaceId);
  if (!trial.expired) return null;
  return NextResponse.json(
    { error: "Seu período de teste terminou. Assine um plano para continuar.", code: "trial_expired" },
    { status: 402 }
  );
}

type LimitKey = keyof Pick<PlanLimits, "clients" | "members" | "socialAccounts">;

async function currentUsage(workspaceId: string, key: LimitKey): Promise<number> {
  if (key === "clients") {
    const [r] = await db.select({ n: count() }).from(clients).where(and(eq(clients.workspaceId, workspaceId), isNull(clients.deletedAt)));
    return Number(r?.n ?? 0);
  }
  if (key === "members") {
    const [r] = await db
      .select({ n: count() })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), isNull(workspaceMembers.deletedAt)));
    return Number(r?.n ?? 0);
  }
  const [r] = await db
    .select({ n: count() })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, workspaceId), isNull(socialAccounts.deletedAt)));
  return Number(r?.n ?? 0);
}

const LIMIT_LABEL: Record<LimitKey, string> = { clients: "clientes", members: "membros", socialAccounts: "contas sociais" };

/** Confere o teto do plano para clientes, membros ou contas. `extra` = quantos serão criados agora. */
export async function denyIfOverPlanLimit(workspaceId: string, key: LimitKey, extra = 1): Promise<NextResponse | null> {
  const plan = await workspacePlan(workspaceId);
  const limit = plan.limits[key];
  if (isUnlimited(limit)) return null;
  const used = await currentUsage(workspaceId, key);
  if (used + extra <= limit) return null;
  return NextResponse.json(
    {
      error: `O plano ${plan.name} permite até ${limit} ${LIMIT_LABEL[key]}. Faça upgrade para adicionar mais.`,
      code: "plan_limit",
    },
    { status: 402 }
  );
}

/** Verdadeiro se adicionar mais uma conta social estourar o plano (para uso fora de rotas JSON). */
export async function accountLimitReached(workspaceId: string): Promise<boolean> {
  return (await denyIfOverPlanLimit(workspaceId, "socialAccounts")) !== null;
}

/**
 * Para os callbacks OAuth: conectar uma conta NOVA estoura o plano?
 * Reconectar uma conta que já está ativa no workspace sempre é permitido.
 */
export async function connectBlockedByPlan(workspaceId: string, platform: typeof socialAccounts.$inferSelect.platform, externalId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.platform, platform),
        eq(socialAccounts.externalId, externalId),
        isNull(socialAccounts.deletedAt)
      )
    )
    .limit(1);
  if (existing) return false;
  return accountLimitReached(workspaceId);
}
