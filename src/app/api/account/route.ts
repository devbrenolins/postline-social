import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { eraseUser } from "@/lib/erase";

export const maxDuration = 60;

/**
 * Exclusão da conta do usuário (LGPD / exigência da App Review).
 *
 * Irreversível: apaga os workspaces de que a pessoa é dona (posts, mídia,
 * contas conectadas e tokens), o perfil e o login. Exige o e-mail digitado como
 * confirmação.
 */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (String(body.confirm ?? "").trim().toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "Digite seu e-mail para confirmar a exclusão." }, { status: 400 });
  }

  await eraseUser(user.id, user.authId);
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    /* sessão já invalidada com o usuário */
  }
  return NextResponse.json({ ok: true });
}
