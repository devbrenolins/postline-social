import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas as rotas exceto assets estáticos e imagens.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|postline-logo.svg|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)",
  ],
};
