import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, generateToken } from "@/lib/auth";
import { xOAuthConfigured, xOAuthUrl, createPkceVerifier } from "@/lib/x";

const STATE_COOKIE = "x_oauth_state";
const VERIFIER_COOKIE = "x_oauth_verifier";

/** Inicia o OAuth 2.0 (PKCE) para conectar uma conta do X. */
export async function GET() {
  const user = await getSessionUser();
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  if (!user) return NextResponse.redirect(`${base}/login`);
  if (!user.workspaceId) return NextResponse.redirect(`${base}/dashboard?error=no-workspace`);
  if (!xOAuthConfigured()) {
    return NextResponse.redirect(`${base}/settings?error=${encodeURIComponent("Integração do X não configurada (X_CLIENT_ID/SECRET).")}`);
  }

  const nonce = generateToken(16);
  const verifier = createPkceVerifier();
  const store = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  store.set(STATE_COOKIE, nonce, opts);
  // O verifier precisa sobreviver ao redirecionamento para provar a posse no callback.
  store.set(VERIFIER_COOKIE, verifier, opts);

  return NextResponse.redirect(xOAuthUrl(`${nonce}.${user.workspaceId}`, verifier));
}
