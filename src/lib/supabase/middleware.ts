import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// As páginas legais e o callback de exclusão precisam abrir sem sessão: o
// revisor da Meta acessa as URLs direto, deslogado.
const PUBLIC_PREFIXES = [
  "/login",
  "/auth",
  "/privacidade",
  "/termos",
  "/exclusao-de-dados",
  "/api/auth",
  "/api/meta/webhook",
  "/api/meta/data-deletion",
  // O webhook do TikTok se protege pela assinatura HMAC, não por sessão. Sem
  // estar aqui, o middleware devolvia 307 para /login — e como o 307 preserva
  // o método, o POST batia numa página e virava 405 do lado do TikTok.
  "/api/tiktok/webhook",
  "/api/health",
  // Chamadas de fora do navegador, sem cookie de sessão: cada uma se protege
  // pelo próprio segredo (CRON_SECRET, ADMIN_SECRET). Sem estarem aqui, o
  // middleware as redireciona para /login e o segredo nunca é conferido.
  "/api/cron",
  "/api/admin",
];

/**
 * Refresca a sessão do Supabase a cada navegação e protege as rotas do app.
 * Se o Supabase não estiver configurado, deixa passar (evita travar o dev antes das chaves).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const path = request.nextUrl.pathname;

  // Sem cookie de sessão do Supabase não há usuário: dispensa a ida à rede.
  // Visitante deslogado (login, páginas legais, webhooks, landing) passa direto.
  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // `getClaims` valida o JWT localmente (chaves assimétricas do projeto) e só
  // vai à rede quando precisa renovar o token — ao contrário do `getUser`, que
  // faz uma chamada ao Supabase em TODA navegação. Com chave simétrica legada
  // ele cai sozinho no comportamento antigo.
  let user: { id: string } | null = null;
  if (hasSessionCookie) {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) user = { id: data.claims.sub };
  }

  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));
  const isStatic = path.startsWith("/_next") || path === "/" || /\.[\w]+$/.test(path);

  if (!user && !isPublic && !isStatic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (path === "/login" || path === "/")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
