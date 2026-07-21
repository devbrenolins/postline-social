import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

/**
 * Callback do Supabase Auth: troca o `code` do OAuth (Google) e dos links
 * de confirmação/recuperação por uma sessão, e provisiona o perfil local.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";
  const errorDescription = searchParams.get("error_description");

  const base = process.env.NEXT_PUBLIC_APP_URL || origin;

  if (errorDescription) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(errorDescription)}`);
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Garante a criação do perfil/workspace no primeiro acesso.
      await getSessionUser().catch(() => null);
      return NextResponse.redirect(`${base}${next}`);
    }
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${base}/login`);
}
