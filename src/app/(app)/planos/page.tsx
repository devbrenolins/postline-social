"use client";

import { Badge } from "@/components/ui";
import { BillingPanel } from "@/components/billing-panel";
import { Coins } from "lucide-react";

/**
 * Planos e créditos como página própria.
 *
 * Estava dentro de uma aba de Configurações, onde ninguém que não fosse
 * procurar encontrava. Aqui ganha item fixo na barra lateral.
 */
export default function PlanosPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge tone="accent"><Coins size={12} /> Assinatura</Badge>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Planos e créditos</h2>
        <p className="mt-1 text-[13.5px] text-muted">
          Acompanhe seu saldo, troque de plano e compre créditos avulsos quando precisar de mais.
        </p>
      </div>

      <BillingPanel />
    </div>
  );
}
