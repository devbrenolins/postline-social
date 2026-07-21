import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, generateToken } from "@/lib/auth";
import { metaOAuthConfigured, metaOAuthUrl } from "@/lib/instagram";

const STATE_COOKIE = "meta_oauth_state";

/** Inicia o fluxo OAuth da Meta para conectar contas Instagram Business. */
export async function GET() {
  const user = await getSessionUser();
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  if (!user) return NextResponse.redirect(`${base}/login`);
  if (!user.workspaceId) return NextResponse.redirect(`${base}/dashboard?error=no-workspace`);
  if (!metaOAuthConfigured()) {
    return NextResponse.redirect(`${base}/settings?error=${encodeURIComponent("Integração Meta não configurada (META_APP_ID/SECRET).")}`);
  }

  const nonce = generateToken(16);
  const state = `${nonce}.${user.workspaceId}`;
  const store = await cookies();
  store.set(STATE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });

  return NextResponse.redirect(metaOAuthUrl(state));
}
