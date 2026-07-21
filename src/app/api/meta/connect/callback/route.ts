import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { socialAccounts, activityLogs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { exchangeCodeForToken, getLongLivedToken, listInstagramAccounts, META_SCOPES } from "@/lib/instagram";

const STATE_COOKIE = "meta_oauth_state";

/** Callback do OAuth da Meta: descobre e salva as contas Instagram Business. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error_description") || searchParams.get("error");

  const done = (params: string) => NextResponse.redirect(`${base}/clients?${params}`);

  if (oauthError) return done(`error=${encodeURIComponent(oauthError)}`);
  if (!code || !state) return done("error=missing-code");

  const user = await getSessionUser();
  if (!user?.workspaceId) return NextResponse.redirect(`${base}/login`);

  // Valida o state (CSRF).
  const store = await cookies();
  const nonce = store.get(STATE_COOKIE)?.value;
  const [stateNonce, stateWid] = state.split(".");
  if (!nonce || nonce !== stateNonce) return done("error=invalid-state");
  store.delete(STATE_COOKIE);

  // Usa o workspace do state se o usuário for membro; senão o ativo.
  const workspaceId = stateWid && stateWid === user.workspaceId ? stateWid : user.workspaceId;

  try {
    const shortToken = await exchangeCodeForToken(code);
    const longToken = await getLongLivedToken(shortToken);
    const accounts = await listInstagramAccounts(longToken);

    if (accounts.length === 0) {
      return done("error=" + encodeURIComponent("Nenhuma conta Instagram Business encontrada. Vincule a conta a uma Página do Facebook."));
    }

    const expiresAt = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000); // ~55 dias
    let connected = 0;
    for (const acc of accounts) {
      await db
        .insert(socialAccounts)
        .values({
          workspaceId,
          platform: "instagram",
          handle: acc.username,
          displayName: acc.name,
          followers: acc.followers,
          connected: true,
          provider: "meta",
          externalId: acc.igId,
          pageId: acc.pageId,
          avatarUrl: acc.profilePicture,
          accessToken: acc.pageToken,
          tokenExpiresAt: expiresAt,
          scopes: META_SCOPES.split(","),
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [socialAccounts.workspaceId, socialAccounts.externalId],
          set: {
            handle: acc.username,
            displayName: acc.name,
            followers: acc.followers,
            connected: true,
            avatarUrl: acc.profilePicture,
            accessToken: acc.pageToken,
            pageId: acc.pageId,
            tokenExpiresAt: expiresAt,
            deletedAt: null,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      connected += 1;
    }

    await db.insert(activityLogs).values({
      workspaceId,
      userId: user.id,
      actorName: user.name,
      actorColor: user.avatarColor,
      action: `conectou ${connected} conta(s) do Instagram`,
      entity: "account",
    });

    return done(`connected=${connected}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao conectar contas.";
    return done(`error=${encodeURIComponent(message)}`);
  }
}
