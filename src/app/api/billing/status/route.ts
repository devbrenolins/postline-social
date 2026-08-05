import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { creditSummary } from "@/lib/credits";

export const maxDuration = 15;

/**
 * Resumo enxuto de plano e saldo.
 *
 * Separado de /api/billing porque a faixa do topo carrega em toda navegação —
 * não faz sentido puxar planos, pacotes e histórico de compras para isso.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json(await creditSummary(user.workspaceId));
}
