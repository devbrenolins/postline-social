"use client";

import { Button, Switch } from "@/components/ui";
import { usePush, type Plataforma, type PushEstado } from "@/lib/use-push";

/**
 * Switch de Web Push nas configurações. A inscrição é por aparelho, não por
 * conta: ativar no celular não ativa no desktop. O texto diz isso porque a
 * confusão é garantida caso contrário.
 */

const TEXTOS: Record<Exclude<PushEstado, "bloqueado">, string> = {
  carregando: "Verificando…",
  indisponivel: "Este navegador não suporta notificações push. No iPhone é preciso iOS 16.4 ou mais recente.",
  "sem-config": "Notificações push ainda não configuradas no servidor.",
  "sw-ausente": "O app ainda não terminou de carregar em segundo plano. Feche e abra o Postline de novo.",
  "precisa-instalar":
    "No iPhone, toque em Compartilhar › Adicionar à Tela de Início e abra o Postline por lá para ativar.",
  off: "Receba avisos mesmo com o app fechado. Vale só para este dispositivo.",
  on: "Ativas neste dispositivo.",
};

/**
 * Permissão negada é definitiva para o app — nenhum navegador deixa perguntar
 * de novo. O único caminho de volta é o usuário mexer nos ajustes, então o
 * texto precisa dizer exatamente onde fica em cada plataforma.
 */
const RECUPERACAO: Record<Plataforma, string> = {
  ios: "Você bloqueou as notificações. Para liberar: Ajustes › Notificações › Postline › Permitir Notificações. Se o Postline não estiver na lista, remova o app da Tela de Início e adicione de novo.",
  android:
    "Você bloqueou as notificações. Para liberar: Configurações do Android › Apps › Postline › Notificações. No navegador, toque no cadeado ao lado do endereço › Permissões.",
  desktop:
    "Você bloqueou as notificações. Para liberar: clique no ícone à esquerda do endereço › Notificações › Permitir.",
};

export function PushToggle() {
  const { estado, ocupado, plataforma, ativar, desativar, sincronizar } = usePush();
  const podeAlternar = estado === "on" || estado === "off";
  const bloqueado = estado === "bloqueado";

  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">Notificações push</p>
        <p className="text-[11.5px] leading-relaxed text-muted">
          {bloqueado ? RECUPERACAO[plataforma] : TEXTOS[estado]}
        </p>
        {bloqueado && (
          // A UI se atualiza sozinha quando a permissão volta (o hook escuta a
          // mudança e o retorno ao foco). O botão fica como saída manual.
          <p className="mt-1 text-[11px] text-muted/70">
            Assim que liberar, volte para cá — as notificações são ativadas automaticamente.
          </p>
        )}
      </div>
      {podeAlternar ? (
        <Switch
          checked={estado === "on"}
          onChange={(v) => void (v ? ativar() : desativar())}
          label="Notificações push"
        />
      ) : bloqueado || estado === "sw-ausente" ? (
        <Button size="sm" variant="outline" onClick={() => void sincronizar()} disabled={ocupado}>
          Verificar
        </Button>
      ) : null}
    </div>
  );
}
