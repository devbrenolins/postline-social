import Link from "next/link";
import { Logo } from "@/components/ui";

/**
 * Casca das páginas públicas exigidas pela App Review da Meta.
 *
 * Precisam abrir sem sessão: o revisor acessa a URL direto, sem login.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2.5 px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-[15px] font-semibold tracking-tight">Postline</span>
          </Link>
          <Link href="/login" className="ml-auto text-[13px] font-medium text-accent hover:underline">
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 pb-20">{children}</main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 pt-6 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] text-[12.5px] text-muted sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Postline</span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto">
            <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link href="/termos" className="hover:text-foreground">Termos</Link>
            <Link href="/exclusao-de-dados" className="hover:text-foreground">Exclusão de dados</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
