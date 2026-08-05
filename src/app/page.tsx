import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, BarChart3, Inbox, Sparkles, ArrowRight } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { Logo } from "@/components/ui";

/**
 * Porta de entrada pública.
 *
 * Antes redirecionava direto para o login, o que deixava quem chega — inclusive
 * o revisor da App Review da Meta — sem nenhuma explicação do que o produto faz.
 */
export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const features = [
    { icon: CalendarDays, title: "Calendário e agendamento", text: "Planeje o mês inteiro e publique no Instagram na hora certa, sem sair da plataforma." },
    { icon: Inbox, title: "Caixa de entrada unificada", text: "Comentários e mensagens diretas em um só lugar, com respostas automáticas por palavra-gatilho." },
    { icon: BarChart3, title: "Métricas reais", text: "Alcance, curtidas, salvamentos e comparativos por cliente, direto da API oficial." },
    { icon: Sparkles, title: "Criação com IA", text: "Roteiros, legendas e criativos gerados a partir do seu briefing, prontos para revisar." },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-2.5 px-5">
          <Logo size={28} />
          <span className="text-[15px] font-semibold tracking-tight">Postline</span>
          <Link
            href="/login"
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-[13px] font-medium text-white transition hover:bg-accent-strong"
          >
            Entrar <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        <section className="py-16 sm:py-24">
          <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Gerencie as redes sociais dos seus clientes em um só lugar.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-muted">
            O Postline reúne planejamento, publicação, atendimento e relatórios para agências e social media
            que cuidam de várias marcas ao mesmo tempo.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[14px] font-medium text-white transition hover:bg-accent-strong"
          >
            Começar agora <ArrowRight size={15} />
          </Link>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-surface p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon size={18} />
              </span>
              <h2 className="mt-3.5 text-[14.5px] font-semibold">{title}</h2>
              <p className="mt-1 text-[13px] leading-6 text-muted">{text}</p>
            </div>
          ))}
        </section>

        <section className="mb-16 rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-[14.5px] font-semibold">Integração com o Instagram</h2>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-6 text-muted">
            A conexão é feita pelo login oficial do Instagram e só acessa o que você autoriza: publicar
            conteúdo, ler métricas e responder comentários e mensagens da conta profissional conectada. Você
            pode revogar o acesso a qualquer momento em Configurações ou pelo próprio Instagram, e pedir a
            exclusão dos seus dados quando quiser.
          </p>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-6 text-[12.5px] text-muted sm:flex-row sm:items-center">
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
