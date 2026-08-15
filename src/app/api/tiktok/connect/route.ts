import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, generateToken } from "@/lib/auth";
import { tiktokOAuthConfigured, tiktokOAuthUrl } from "@/lib/tiktok";

const STATE_COOKIE = "tiktok_oauth_state";

/** Inicia o Login Kit do TikTok para conectar uma conta. */
export async function GET() {
  const user = await getSessionUser();
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  if (!user) return NextResponse.redirect(`${base}/login`);
  if (!user.workspaceId) return NextResponse.redirect(`${base}/dashboard?error=no-workspace`);
  if (!tiktokOAuthConfigured()) {
    return NextResponse.redirect(`${base}/settings?error=${encodeURIComponent("Integração do TikTok não configurada (TIKTOK_CLIENT_KEY/SECRET).")}`);
  }

  const nonce = generateToken(16);
  const store = await cookies();
  store.set(STATE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });

  return NextResponse.redirect(tiktokOAuthUrl(`${nonce}.${user.workspaceId}`));
}
