"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Coins, Loader2, Sparkles } from "lucide-react";
import { Badge, Button, InlineError, cn } from "@/components/ui";
import { formatBRL, isUnlimited, type Plan, type PlanId } from "@/lib/plans";
import { toast } from "sonner";

type Pack = { id: string; name: string; kind: "script" | "creative"; credits: number; priceCents: number };
type Bucket = { label: string; dailyCredits: number; dailyGenerations: number; used: number; remainingDaily: number; purchased: number; available: number };
type Purchase = { id: string; packId: string; kind: string; credits: string; amountCents: number; status: string; createdAt: string };

type Trial = { isTrial: boolean; endsAt: string | null; daysLeft: number; expired: boolean };

type Billing = {
  workspace: { name: string; plan: string };
  plans: Plan[];
  packs: Pack[];
  credits: { plan: { id: string; name: string }; trial: Trial; script: Bucket; creative: Bucket; lowBalance: boolean; blocked: boolean };
  purchases: Purchase[];
  isAdmin: boolean;
  simulated: boolean;
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const limitLabel = (v: number) => (isUnlimited(v) ? "Ilimitado" : String(v));

/** Planos, franquia diária e compra de pacotes avulsos. */
export function BillingPanel() {
  const [data, setData] = useState<Billing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError("Não foi possível carregar os planos.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function call(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível concluir.");
      await load();
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function buy(pack: Pack) {
    const started = await call({ action: "startPurchase", packId: pack.id }, `buy-${pack.id}`);
    if (!started?.purchase) return;
    // Aqui entraria o checkout do provedor. Sem ele, a confirmação é imediata.
    const done = await call({ action: "confirmPurchase", purchaseId: started.purchase.id }, `buy-${pack.id}`);
    if (done) {
      toast.success(`${pack.credits} créditos adicionados ao saldo.`);
      window.dispatchEvent(new CustomEvent("postline:credits-changed"));
    }
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 py-10 text-[13px] text-muted">
        <Loader2 size={15} className="animate-spin" /> Carregando planos…
      </div>
    );
  }

  const buckets = [
    { name: "Roteiros", bucket: data.credits.script },
    { name: "Criativos", bucket: data.credits.creative },
  ];

  return (
    <div className="space-y-6">
      {data.simulated && (
        <div className="rounded-xl border border-warning/25 bg-warning/8 px-3.5 py-2.5 text-[12.5px] text-warning">
          Ambiente sem cobrança: trocar de plano e comprar créditos funcionam de verdade no saldo, mas
          nenhum pagamento é processado.
        </div>
      )}

      {error && <InlineError>{error}</InlineError>}

      {/* ------------------------------- Saldo ------------------------------- */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <Coins size={16} className="text-accent" />
          <h3 className="text-[13.5px] font-semibold">Saldo de hoje</h3>
          <Badge tone="accent" className="ml-auto">Plano {data.credits.plan.name}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {buckets.map(({ name, bucket }) => (
            <div key={name} className="rounded-xl bg-surface-2/60 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold">{name}</p>
                <span className="text-[11px] text-muted">{bucket.dailyGenerations} gerações/dia</span>
              </div>
              <p className="mt-2 text-[19px] font-semibold tnum">{fmt(bucket.available)}</p>
              <p className="text-[10.5px] text-muted">
                {fmt(bucket.remainingDaily)} da franquia diária
                {bucket.purchased > 0 && ` + ${fmt(bucket.purchased)} comprados`}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------- Planos ------------------------------ */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13.5px] font-semibold">
            {data.credits.trial.expired ? "Escolha um plano para continuar" : "Planos"}
          </h3>
          {data.credits.trial.isTrial && !data.credits.trial.expired && (
            <p className="text-[12px] text-muted">
              Restam {data.credits.trial.daysLeft} {data.credits.trial.daysLeft === 1 ? "dia" : "dias"} de teste — assine
              antes do fim e não perca o que já criou.
            </p>
          )}
        </div>
        {/* O teste não é assinável: só aparece se for o plano atual. */}
        <div className="grid gap-3 lg:grid-cols-2">
          {data.plans
            .filter((plan) => plan.id !== "trial" || plan.id === data.workspace.plan)
            .map((plan) => {
            const current = plan.id === data.workspace.plan;
            const recommended = plan.id === "pro" && !current;
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-4",
                  current ? "border-accent bg-accent-soft/30" : recommended ? "border-accent/60 bg-surface shadow-md" : "border-border bg-surface"
                )}
              >
                {recommended && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold text-white">
                    Mais escolhido
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-semibold">{plan.name}</p>
                  {current && <Badge tone="accent">Atual</Badge>}
                </div>
                <p className="mt-1 text-[11.5px] leading-4 text-muted">{plan.tagline}</p>
                <p className="mt-3 text-[22px] font-semibold tnum">
                  {plan.priceCents === 0 ? "Grátis" : formatBRL(plan.priceCents)}
                  {plan.priceCents > 0 && <span className="text-[12px] font-normal text-muted">/mês</span>}
                </p>

                <ul className="mt-3 space-y-1.5 text-[12px]">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-1.5">
                      <Check size={13} className="mt-0.5 shrink-0 text-success" /> {h}
                    </li>
                  ))}
                </ul>

                <dl className="mt-3 space-y-1 border-t border-border pt-3 text-[11px] text-muted">
                  <div className="flex justify-between"><dt>Clientes</dt><dd>{limitLabel(plan.limits.clients)}</dd></div>
                  <div className="flex justify-between"><dt>Contas sociais</dt><dd>{limitLabel(plan.limits.socialAccounts)}</dd></div>
                  <div className="flex justify-between"><dt>Membros</dt><dd>{limitLabel(plan.limits.members)}</dd></div>
                  <div className="flex justify-between"><dt>Roteiros/dia</dt><dd>{plan.limits.dailyGenerations.script}</dd></div>
                  <div className="flex justify-between"><dt>Criativos/dia</dt><dd>{plan.limits.dailyGenerations.creative}</dd></div>
                </dl>

                <div className="mt-4">
                  {current ? (
                    <Button variant="outline" className="w-full" disabled>Plano atual</Button>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={!data.isAdmin}
                      loading={busy === `plan-${plan.id}`}
                      onClick={async () => {
                        const done = await call({ action: "changePlan", plan: plan.id as PlanId }, `plan-${plan.id}`);
                        if (done) {
                          toast.success(`Plano alterado para ${plan.name}.`);
                          window.dispatchEvent(new CustomEvent("postline:credits-changed"));
                        }
                      }}
                    >
                      <Sparkles size={14} /> Assinar {plan.name} · {formatBRL(plan.priceCents)}/mês
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {!data.isAdmin && (
          <p className="mt-2 text-[11.5px] text-muted">Somente administradores do workspace podem alterar o plano.</p>
        )}
      </section>

      {/* ------------------------------ Pacotes ------------------------------ */}
      <section>
        <h3 className="mb-1 text-[13.5px] font-semibold">Comprar créditos avulsos</h3>
        <p className="mb-3 text-[12px] text-muted">
          Entram no saldo do workspace e não expiram. São usados só depois que a franquia do dia acaba.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.packs.map((pack) => (
            <div key={pack.id} className="rounded-2xl border border-border bg-surface p-4">
              <Badge tone={pack.kind === "script" ? "info" : "accent"}>
                {pack.kind === "script" ? "Roteiros" : "Criativos"}
              </Badge>
              <p className="mt-2 text-[19px] font-semibold tnum">{pack.credits}</p>
              <p className="text-[11.5px] text-muted">créditos</p>
              <p className="mt-2 text-[14px] font-semibold">{formatBRL(pack.priceCents)}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                disabled={!data.isAdmin}
                loading={busy === `buy-${pack.id}`}
                onClick={() => buy(pack)}
              >
                Comprar
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------ Histórico ---------------------------- */}
      {data.purchases.length > 0 && (
        <section>
          <h3 className="mb-3 text-[13.5px] font-semibold">Compras recentes</h3>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-125 text-[12px]">
              <thead className="bg-surface-2/60 text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Data</th>
                  <th className="px-3 py-2 text-left font-medium">Pacote</th>
                  <th className="px-3 py-2 text-right font-medium">Créditos</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-right font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {data.purchases.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2 text-muted">{new Date(p.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-2">{p.packId}</td>
                    <td className="px-3 py-2 text-right tnum">{fmt(Number(p.credits))}</td>
                    <td className="px-3 py-2 text-right tnum">{formatBRL(p.amountCents)}</td>
                    <td className="px-3 py-2 text-right">
                      <Badge tone={p.status === "paid" ? "success" : p.status === "cancelled" ? "danger" : "warning"}>
                        {p.status === "paid" ? "Paga" : p.status === "cancelled" ? "Cancelada" : "Pendente"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
