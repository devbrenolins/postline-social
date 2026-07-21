import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts, analyticsDaily } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { getAccountSnapshot, sendDirectMessage } from "@/lib/instagram";

/** Lista as contas sociais conectadas do workspace (sem expor tokens). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const rows = await db
    .select({
      id: socialAccounts.id,
      platform: socialAccounts.platform,
      handle: socialAccounts.handle,
      displayName: socialAccounts.displayName,
      followers: socialAccounts.followers,
      connected: socialAccounts.connected,
      provider: socialAccounts.provider,
      avatarUrl: socialAccounts.avatarUrl,
      externalId: socialAccounts.externalId,
      lastSyncedAt: socialAccounts.lastSyncedAt,
      clientId: socialAccounts.clientId,
    })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, user.workspaceId), isNull(socialAccounts.deletedAt)));

  return NextResponse.json({ accounts: rows });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const wid = user.workspaceId;
  const body = await req.json().catch(() => ({}));

  async function loadAccount(id: string) {
    return (
      await db
        .select()
        .from(socialAccounts)
        .where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, wid), isNull(socialAccounts.deletedAt)))
        .limit(1)
    )[0];
  }

  switch (body.action) {
    case "sync": {
      // Sincroniza métricas de uma conta específica ou de todas as conectadas.
      const targets = body.id
        ? [await loadAccount(String(body.id))].filter(Boolean)
        : await db
            .select()
            .from(socialAccounts)
            .where(and(eq(socialAccounts.workspaceId, wid), eq(socialAccounts.connected, true), isNull(socialAccounts.deletedAt)));

      const today = new Date().toISOString().slice(0, 10);
      const results: { id: string; ok: boolean; error?: string }[] = [];

      for (const acc of targets) {
        if (!acc?.externalId || !acc.accessToken) {
          results.push({ id: acc?.id ?? "", ok: false, error: "Conta sem token oficial." });
          continue;
        }
        try {
          const snap = await getAccountSnapshot(acc.externalId, acc.accessToken);
          await db
            .update(socialAccounts)
            .set({
              followers: snap.followers,
              avatarUrl: snap.profilePicture ?? acc.avatarUrl,
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(socialAccounts.id, acc.id));

          await db
            .insert(analyticsDaily)
            .values({
              workspaceId: wid,
              socialAccountId: acc.id,
              platform: "instagram",
              day: today,
              followers: snap.followers,
              reach: snap.reach,
              impressions: snap.impressions,
            })
            .onConflictDoUpdate({
              target: [analyticsDaily.socialAccountId, analyticsDaily.day],
              set: { followers: snap.followers, reach: snap.reach, impressions: snap.impressions, updatedAt: new Date() },
            });
          results.push({ id: acc.id, ok: true });
        } catch (e) {
          results.push({ id: acc.id, ok: false, error: e instanceof Error ? e.message : "Falha na sincronização." });
        }
      }
      return NextResponse.json({ ok: true, results });
    }

    case "dm": {
      const acc = await loadAccount(String(body.id));
      if (!acc) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
      if (!acc.externalId || !acc.accessToken) return NextResponse.json({ error: "Conta sem integração oficial." }, { status: 400 });
      const recipientId = String(body.recipientId ?? "").trim();
      const text = String(body.text ?? "").trim();
      if (!recipientId || !text) return NextResponse.json({ error: "Informe destinatário e mensagem." }, { status: 400 });
      try {
        await sendDirectMessage(acc.externalId, acc.accessToken, recipientId, text);
        return NextResponse.json({ ok: true });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao enviar direct." }, { status: 502 });
      }
    }

    case "disconnect": {
      await db
        .update(socialAccounts)
        .set({ connected: false, accessToken: null, deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(socialAccounts.id, String(body.id)), eq(socialAccounts.workspaceId, wid)));
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }
}
