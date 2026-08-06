"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Clock, Sparkles } from "lucide-react";
import { cn } from "@/components/ui";

type Bucket = { label: string; dailyCredits: number; available: number };
type Credits = {
  plan: { id: string; name: string };
  trial: { isTrial: boolean; endsAt: string | null; daysLeft: number; expired: boolean };
  script: Bucket;
  creative: Bucket;
  lowBalance: boolean;
  blocked: boolean;
  upgrade: { id: string; name: string; priceCents: number } | null;
};

/**
 * Faixa de plano, fixa abaixo do topo.
 *
 * O saldo não pode viver escondido numa aba de configurações: quem está em
 * teste precisa ver o prazo correndo, e quem está no fim do saldo precisa
 * encontrar o caminho da compra sem procurar.
 */
export function PlanBanner() {
  const [credits, setCredits] = useState<Credits | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (res.ok) setCredits(await res.json());
    } catch {
      // Silencioso: a faixa é auxiliar, não pode quebrar a navegação.
    }
  }, []);

  useEffect(() => {
    load();
    const fn = () => load();
    window.addEventListener("postline:credits-changed", fn);
    return () => window.removeEventListener("postline:credits-changed", fn);
  }, [load]);

  if (!credits) return null;

  const { trial, upgrade } = credits;

  // 1) Teste expirado — o mais urgente.
  if (trial.expired) {
    return (
      <Bar
        tone="danger"
        icon={<AlertCircle size={15} />}
        text={<>Seu teste terminou. Assine para voltar a publicar e criar com IA.</>}
        cta="Ver planos"
      />
    );
  }

  // 2) Teste acabando.
  if (trial.isTrial) {
    const urgent = trial.daysLeft <= 3;
    return (
      <Bar
        tone={urgent ? "warning" : "accent"}
        icon={<Clock size={15} />}
        text={
          <>
            {trial.daysLeft === 0 ? (
              <>Último dia de teste.</>
            ) : (
              <>
                Faltam <b>{trial.daysLeft} {trial.daysLeft === 1 ? "dia" : "dias"}</b> de teste.
              </>
            )}{" "}
            {upgrade && <>Continue no {upgrade.name} sem perder seu conteúdo.</>}
          </>
        }
        cta={urgent ? "Assinar agora" : "Ver planos"}
      />
    );
  }

  // 3) Pagante com saldo acabando.
  if (credits.lowBalance) {
    const empty = credits.script.available <= 0 || credits.creative.available <= 0;
    return (
      <Bar
        tone={empty ? "danger" : "warning"}
        icon={<AlertCircle size={15} />}
        text={
          empty
            ? <>Seu saldo de créditos acabou. Compre um pacote para continuar gerando hoje.</>
            : <>Seu saldo de créditos está acabando.</>
        }
        cta={empty ? "Comprar créditos" : "Ver saldo"}
      />
    );
  }

  return null;
}

function Bar({ tone, icon, text, cta }: {
  tone: "accent" | "warning" | "danger";
  icon: React.ReactNode;
  text: React.ReactNode;
  cta: string;
}) {
  const tones = {
    accent: "border-accent/25 bg-accent-soft text-accent",
    warning: "border-warning/25 bg-warning/10 text-warning",
    danger: "border-danger/25 bg-danger/10 text-danger",
  };
  return (
    <div className={cn("border-b px-4 py-2 sm:px-6 lg:px-8", tones[tone])}>
      <div className="mx-auto flex max-w-350 flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-2 text-[12.5px] font-medium">
          {icon} {text}
        </span>
        <Link
          href="/planos"
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-current/12 px-2.5 py-1 text-[12px] font-semibold transition hover:bg-current/20"
        >
          <Sparkles size={12} /> {cta} <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
