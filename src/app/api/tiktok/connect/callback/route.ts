import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { exchangeCodeForToken, getProfile } from "@/lib/tiktok";

const STATE_COOKIE = "tiktok_oauth_state";

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  const done = (query: string) => NextResponse.redirect(`${base}/clients?${query}`);

  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(`${base}/login`);

  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  if (sp.get("error") || !code || !state) {
    return done(`error=${encodeURIComponent(sp.get("error_description") || "Conexão com o TikTok cancelada.")}`);
  }

  const store = await cookies();
  const nonce = store.get(STATE_COOKIE)?.value;
  const [stateNonce, stateWid] = state.split(".");
  if (!nonce || nonce !== stateNonce) return done("error=invalid-state");
  store.delete(STATE_COOKIE);

  const workspaceId = stateWid && stateWid === user.workspaceId ? stateWid : user.workspaceId;

  try {
    const tokens = await exchangeCodeForToken(code);
    const profile = await getProfile(tokens.accessToken);
    // `open_id` é o identificador estável da conta para este app.
    const externalId = profile.openId || tokens.openId;
    const handle = profile.username || profile.displayName || externalId;

    await db
      .insert(socialAccounts)
      .values({
        workspaceId,
        platform: "tiktok",
        handle,
        displayName: profile.displayName || handle,
        followers: profile.followers,
        connected: true,
        provider: "tiktok",
        externalId,
        avatarUrl: profile.avatarUrl,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [socialAccounts.workspaceId, socialAccounts.externalId],
        set: {
          handle,
          displayName: profile.displayName || handle,
          followers: profile.followers,
          connected: true,
          avatarUrl: profile.avatarUrl,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresAt,
          scopes: tokens.scopes,
          deletedAt: null,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    return done(`connected=tiktok&handle=${encodeURIComponent(handle)}`);
  } catch (e) {
    return done(`error=${encodeURIComponent(e instanceof Error ? e.message : "Falha ao conectar o TikTok.")}`);
  }
}
