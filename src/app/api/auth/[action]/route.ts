import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

/**
 * Auth agora é gerida pelo Supabase (login/registro/OAuth acontecem no client
 * via `@/lib/supabase/client`). Este handler mantém apenas o logout server-side
 * e um `me` de conveniência para código existente.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;

  if (action === "logout") {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      /* já deslogado ou Supabase indisponível */
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida. Use o cliente Supabase para login/registro." }, { status: 404 });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== "me") return NextResponse.json({ error: "Ação inválida." }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({ user });
}
