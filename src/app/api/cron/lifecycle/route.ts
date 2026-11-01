import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { refreshLongLivedToken } from "@/lib/instagram";
import { db } from "@/db";
import { socialAccounts, workspaces } from "@/db/schema";
import { notifyUser, notifyWorkspace } from "@/lib/push";

export const maxDuration = 60;

/**
 * Avisos de ciclo de vida. Chame de hora em hora (Vercel Cron) com
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * Cobre dois casos que quebram o produto em silêncio:
 *  1. Teste gratuito acabando — o usuário perde acesso sem ver vindo.
 *  2. Token do Instagram vencendo — a publicação agendada começa a falhar sem
 *     que ninguém saiba até o post não sair.
 *
 * Reexecutar é seguro: cada aviso carrega uma `dedupeKey` e a segunda inserção
 * é descartada pelo índice único.
 */
const DIA = 24 * 60 * 60 * 1000;

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Fail-closed: sem CRON_SECRET configurado a rota recusa tudo.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const agora = new Date();
  let trialAvisos = 0;
  let tokenAvisos = 0;

  /* ---------------------- 1. Teste gratuito acabando --------------------- */

  const emTeste = await db
    .select({ id: workspaces.id, name: workspaces.name, ownerId: workspaces.ownerId, trialEndsAt: workspaces.trialEndsAt })
    .from(workspaces)
    .where(and(eq(workspaces.plan, "trial"), isNotNull(workspaces.trialEndsAt), isNull(workspaces.deletedAt)));

  for (const ws of emTeste) {
    const restam = ws.trialEndsAt!.getTime() - agora.getTime();
    const dias = Math.ceil(restam / DIA);

    // Só três marcos. Sem isso o aviso viraria ruído diário durante o teste todo.
    let marco: string | null = null;
    let titulo = "";
    let corpo = "";
    if (restam <= 0) {
      marco = "fim";
      titulo = "Seu teste gratuito terminou";
      corpo = "Assine para voltar a agendar e publicar sem interrupção.";
    } else if (dias <= 1) {
      marco = "1d";
      titulo = "Seu teste acaba amanhã";
      corpo = "Escolha um plano para não perder os agendamentos já programados.";
    } else if (dias <= 3) {
      marco = "3d";
      titulo = `Seu teste acaba em ${dias} dias`;
      corpo = "Aproveite para escolher um plano com calma.";
    }
    if (!marco) continue;

    await notifyUser(ws.ownerId, {
      workspaceId: ws.id,
      title: titulo,
      body: corpo,
      kind: restam <= 0 ? "warning" : "info",
      url: "/planos",
      dedupeKey: `trial:${ws.id}:${marco}`,
    });
    trialAvisos += 1;
  }

  /* ------------- 2a. Renova sozinho os tokens do Instagram ---------------- */

  // O long-lived dura ~60 dias e pode ser renovado enquanto não vencer. Renovar
  // aqui evita que o usuário precise reconectar; o aviso abaixo só dispara para
  // quem falhou (token já vencido, permissão revogada...).
  let renovados = 0;
  const paraRenovar = await db
    .select({ id: socialAccounts.id, accessToken: socialAccounts.accessToken })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.platform, "instagram"),
        eq(socialAccounts.connected, true),
        isNotNull(socialAccounts.accessToken),
        isNotNull(socialAccounts.tokenExpiresAt),
        lte(socialAccounts.tokenExpiresAt, new Date(agora.getTime() + 15 * DIA)),
        gt(socialAccounts.tokenExpiresAt, agora),
        isNull(socialAccounts.deletedAt)
      )
    );
  for (const conta of paraRenovar) {
    try {
      const novo = await refreshLongLivedToken(conta.accessToken!);
      await db
        .update(socialAccounts)
        .set({ accessToken: novo, tokenExpiresAt: new Date(Date.now() + 55 * DIA), updatedAt: new Date() })
        .where(eq(socialAccounts.id, conta.id));
      renovados += 1;
    } catch (e) {
      console.error(`[cron/lifecycle] falha ao renovar token ${conta.id}`, e);
    }
  }

  /* --------------------- 2b. Token do Instagram vencendo ----------------- */

  const limite = new Date(agora.getTime() + 7 * DIA);
  const vencendo = await db
    .select({
      id: socialAccounts.id,
      workspaceId: socialAccounts.workspaceId,
      handle: socialAccounts.handle,
      tokenExpiresAt: socialAccounts.tokenExpiresAt,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.connected, true),
        isNotNull(socialAccounts.tokenExpiresAt),
        lte(socialAccounts.tokenExpiresAt, limite),
        isNull(socialAccounts.deletedAt)
      )
    );

  for (const conta of vencendo) {
    const venceu = conta.tokenExpiresAt!.getTime() <= agora.getTime();
    // A data entra na chave: token renovado tem novo vencimento e pode alertar
    // de novo no futuro, sem repetir o aviso do vencimento atual.
    const chave = conta.tokenExpiresAt!.toISOString().slice(0, 10);
    await notifyWorkspace({
      workspaceId: conta.workspaceId,
      title: venceu ? `@${conta.handle} precisa reconectar` : `@${conta.handle} expira em breve`,
      body: venceu
        ? "A conexão expirou. Os posts agendados desta conta não vão publicar até você reconectar."
        : "Reconecte a conta para não interromper as publicações agendadas.",
      kind: "warning",
      url: "/settings",
      dedupeKey: `token:${conta.id}:${chave}`,
    });
    tokenAvisos += 1;
  }

  return NextResponse.json({ ok: true, trialAvisos, tokenAvisos, renovados });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
