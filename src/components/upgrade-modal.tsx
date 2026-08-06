"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Check, Clock, Coins, Sparkles, X } from "lucide-react";
import { Badge, Button, cn, Overlay, panelCls } from "@/components/ui";
import { formatBRL, isUnlimited, type Plan, type PlanId } from "@/lib/plans";
import { toast } from "sonner";

type Trial = { isTrial: boolean; endsAt: string | null; daysLeft: number; expired: boolean };
type Bucket = { label: string; available: number };
type Status = {
  plan: { id: string; name: string };
  trial: Trial;
  script: Bucket;
  creative: Bucket;
  lowBalance: boolean;
  blocked: boolean;
};

/**
 * Dispensa válida só para a sessão atual.
 *
 * `sessionStorage` e não `localStorage`: fechar o modal cala ele enquanto a
 * pessoa está usando o app, mas na próxima vez que ela entrar no site a oferta
 * aparece de novo.
 */
const DISMISS_KEY = "postline:upgrade-dismissed";

function dismissedThisSession() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Navegação anônima: sem persistência, reaparece — aceitável.
  }
}

/**
 * Convite de assinatura na entrada do app.
 *
 * Com o teste expirado é bloqueante: não há plano gratuito, então continuar
 * usando exige escolher um. Nos demais casos é dispensável e só reaparece no
 * dia seguinte.
 */
export function UpgradeModal() {
  const [status, setStatus] = useState<Status | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Status;
      setStatus(data);

      // Aparece em toda entrada enquanto houver o que vender: durante todo o
      // teste, com saldo baixo, ou com o teste expirado. Só fica de fora quem
      // já assinou e está com saldo saudável.
      const urgent = data.trial.expired;
      const sellable = data.trial.isTrial || data.lowBalance;
      if (urgent || (sellable && !dismissedThisSession())) {
        const billing = await fetch("/api/billing", { cache: "no-store" });
        if (billing.ok) setPlans(((await billing.json()) as { plans: Plan[] }).plans);
        setOpen(true);
      }
    } catch {
      // A venda não pode derrubar a navegação.
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const blocking = Boolean(status?.trial.expired);

  function close() {
    if (blocking) return;
    markDismissed();
    setOpen(false);
  }

  async function subscribe(plan: Plan) {
    setBusy(plan.id);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "changePlan", plan: plan.id as PlanId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível assinar.");
      toast.success(`Plano ${plan.name} ativado.`);
      window.dispatchEvent(new CustomEvent("postline:credits-changed"));
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao assinar.");
    } finally {
      setBusy(null);
    }
  }

  if (!status) return null;

  const urgentTrial = status.trial.isTrial && status.trial.daysLeft <= 3;

  const headline = blocking
    ? "Seu teste terminou"
    : status.trial.isTrial
      ? status.trial.daysLeft === 0
        ? "Hoje é o último dia do seu teste"
        : urgentTrial
          ? `Seu teste acaba em ${status.trial.daysLeft} ${status.trial.daysLeft === 1 ? "dia" : "dias"}`
          : "Publique em 6 redes sem sair daqui"
      : "Seu saldo está acabando";

  const subline = blocking
    ? "Escolha um plano para voltar a publicar, criar com IA e responder no direct. Tudo que você já criou continua salvo."
    : status.trial.isTrial
      ? urgentTrial
        ? "Garanta seu plano antes do fim e siga sem interrupção — seus posts, clientes e automações continuam exatamente como estão."
        : "Roteiros e criativos com IA, agendamento, relatórios e resposta automática no direct. Assine e continue com tudo quando o teste acabar."
      : "Compre créditos avulsos ou suba de plano para voltar a gerar agora.";

  /** Argumentos curtos, acima dos preços — quem não conhece o produto decide aqui. */
  const valueProps = [
    "Agende e publique em 6 redes",
    "Roteiros e criativos com IA",
    "Responde no direct automaticamente",
    "Relatórios por cliente",
  ];

  const sellable = plans.filter((p) => p.id !== "trial");

  return (
    <Overlay open={open} onClose={blocking ? undefined : close} zIndex={60}>
      <motion.div
        role="dialog" aria-modal="true" aria-label={headline}
        className={cn(panelCls, "max-w-3xl")}
        initial={{ y: 16, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 10, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
      >
        {!blocking && (
          <button
            onClick={close}
            aria-label="Agora não"
            className="absolute right-3 top-3 z-10 rounded-lg bg-surface/85 p-1.5 text-muted shadow-sm backdrop-blur transition hover:bg-surface-2 hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="border-b border-border px-5 py-5 text-center sm:px-8 sm:py-7">
            <span className={cn(
              "mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl",
              blocking ? "bg-danger/12 text-danger" : "bg-accent-soft text-accent"
            )}>
              {blocking ? <AlertCircle size={21} /> : status.trial.isTrial ? <Clock size={21} /> : <Coins size={21} />}
            </span>
            <h2 className="text-[20px] font-semibold tracking-tight sm:text-[23px]">{headline}</h2>
            <p className="mx-auto mt-1.5 max-w-lg text-[13.5px] leading-6 text-muted">{subline}</p>

            <ul className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-x-4 gap-y-1.5">
              {valueProps.map((v) => (
                <li key={v} className="flex items-center gap-1.5 text-[12px] text-foreground/80">
                  <Check size={12} className="shrink-0 text-success" /> {v}
                </li>
              ))}
            </ul>

            {status.trial.isTrial && !blocking && (
              <p className="mt-3 text-[11.5px] text-muted">
                Assinando agora, você não perde nada do que já configurou.
              </p>
            )}
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
            {sellable.map((plan) => {
              const recommended = plan.id === "pro";
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col rounded-2xl border p-4",
                    recommended ? "border-accent shadow-md" : "border-border"
                  )}
                >
                  {recommended && (
                    <span className="absolute -top-2.5 left-4 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold text-white">
                      Mais escolhido
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-semibold">{plan.name}</p>
                    {plan.id === status.plan.id && <Badge tone="accent">Atual</Badge>}
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-4 text-muted">{plan.tagline}</p>
                  <p className="mt-3 text-[24px] font-semibold tnum">
                    {formatBRL(plan.priceCents)}
                    <span className="text-[12px] font-normal text-muted">/mês</span>
                  </p>
                  <ul className="mt-3 flex-1 space-y-1.5 text-[12px]">
                    {plan.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-1.5">
                        <Check size={13} className="mt-0.5 shrink-0 text-success" /> {h}
                      </li>
                    ))}
                    <li className="flex items-start gap-1.5">
                      <Check size={13} className="mt-0.5 shrink-0 text-success" />
                      {plan.limits.dailyGenerations.script} roteiros e {plan.limits.dailyGenerations.creative} criativos por dia
                    </li>
                    <li className="flex items-start gap-1.5">
                      <Check size={13} className="mt-0.5 shrink-0 text-success" />
                      {isUnlimited(plan.limits.clients) ? "Clientes ilimitados" : `${plan.limits.clients} clientes`}
                    </li>
                  </ul>
                  <Button
                    className="mt-4 w-full"
                    variant={recommended ? "primary" : "outline"}
                    loading={busy === plan.id}
                    disabled={plan.id === status.plan.id}
                    onClick={() => subscribe(plan)}
                  >
                    <Sparkles size={14} />
                    {plan.id === status.plan.id ? "Plano atual" : `Assinar ${plan.name}`}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border px-5 py-3.5 text-center sm:px-6">
            {blocking ? (
              <p className="text-[11.5px] text-muted">
                Sem plano ativo, a criação com IA e a publicação ficam bloqueadas.
              </p>
            ) : (
              <button onClick={close} className="text-[12.5px] font-medium text-muted hover:text-foreground">
                Agora não
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </Overlay>
  );
}
