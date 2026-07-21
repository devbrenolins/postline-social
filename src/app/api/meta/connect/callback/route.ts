import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { socialAccounts, activityLogs } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { exchangeCodeForToken, getLongLivedToken, getSelfAccount, META_SCOPES } from "@/lib/instagram";

const STATE_COOKIE = "meta_oauth_state";

/** Callback do Instagram Login: descobre e salva a conta Instagram Business conectada. */
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
    const { token: shortToken, userId } = await exchangeCodeForToken(code);
    const longToken = await getLongLivedToken(shortToken);
    const acc = await getSelfAccount(longToken, userId);

    const expiresAt = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000); // ~55 dias
    await db
      .insert(socialAccounts)
      .values({
        workspaceId,
        platform: "instagram",
        handle: acc.username,
        displayName: acc.name,
        followers: acc.followers,
        connected: true,
        provider: "instagram",
        externalId: acc.igId,
        avatarUrl: acc.profilePicture,
        accessToken: longToken,
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
          accessToken: longToken,
          tokenExpiresAt: expiresAt,
          deletedAt: null,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    await db.insert(activityLogs).values({
      workspaceId,
      userId: user.id,
      actorName: user.name,
      actorColor: user.avatarColor,
      action: `conectou a conta @${acc.username} do Instagram`,
      entity: "account",
    });

    return done(`connected=1`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao conectar contas.";
    return done(`error=${encodeURIComponent(message)}`);
  }
}
