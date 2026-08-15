import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { exchangeCodeForToken, getMe, X_SCOPES } from "@/lib/x";

const STATE_COOKIE = "x_oauth_state";
const VERIFIER_COOKIE = "x_oauth_verifier";

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  const done = (query: string) => NextResponse.redirect(`${base}/clients?${query}`);

  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(`${base}/login`);

  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  if (sp.get("error") || !code || !state) {
    return done(`error=${encodeURIComponent(sp.get("error_description") || "Conexão com o X cancelada.")}`);
  }

  const store = await cookies();
  const nonce = store.get(STATE_COOKIE)?.value;
  const verifier = store.get(VERIFIER_COOKIE)?.value;
  const [stateNonce, stateWid] = state.split(".");
  if (!nonce || nonce !== stateNonce || !verifier) return done("error=invalid-state");
  store.delete(STATE_COOKIE);
  store.delete(VERIFIER_COOKIE);

  const workspaceId = stateWid && stateWid === user.workspaceId ? stateWid : user.workspaceId;

  try {
    const tokens = await exchangeCodeForToken(code, verifier);
    const me = await getMe(tokens.accessToken);

    await db
      .insert(socialAccounts)
      .values({
        workspaceId,
        platform: "x",
        handle: me.username,
        displayName: me.name,
        followers: me.followers,
        connected: true,
        provider: "x",
        externalId: me.id,
        avatarUrl: me.avatarUrl,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scopes: X_SCOPES,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [socialAccounts.workspaceId, socialAccounts.externalId],
        set: {
          handle: me.username,
          displayName: me.name,
          followers: me.followers,
          connected: true,
          avatarUrl: me.avatarUrl,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresAt,
          deletedAt: null,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    return done(`connected=x&handle=${encodeURIComponent(me.username)}`);
  } catch (e) {
    return done(`error=${encodeURIComponent(e instanceof Error ? e.message : "Falha ao conectar o X.")}`);
  }
}
