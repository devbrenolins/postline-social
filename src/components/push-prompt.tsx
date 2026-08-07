"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { usePush } from "@/lib/use-push";

/**
 * Oferece as notificações no momento em que elas fazem sentido: logo depois que
 * o usuário tem o primeiro post agendado. O popup do sistema só dispara no
 * clique em "Ativar" — pedir sem contexto queima a permissão, que é definitiva
 * quando negada.
 *
 * O switch em Configurações › Notificações continua sendo o lugar de ligar e
 * desligar quando quiser; este card é só o convite.
 */

/**
 * A dispensa fica no dispositivo, não na conta: a inscrição de push também é
 * por aparelho, então quem dispensou no celular ainda deve ver o convite no
 * desktop, onde ainda não ativou nada.
 */
const CHAVE_DISPENSA = "postline.push-prompt-dispensado";

export function PushPrompt() {
  const { data } = useWorkspace();
  const { estado, ocupado, ativar } = usePush();
  const [dispensado, setDispensado] = useState(true); // Pessimista até ler o storage.

  useEffect(() => {
    try {
      setDispensado(localStorage.getItem(CHAVE_DISPENSA) === "1");
    } catch {
      setDispensado(false); // Storage bloqueado: mostra uma vez, sem persistir.
    }
  }, []);

  function dispensar() {
    setDispensado(true);
    try {
      localStorage.setItem(CHAVE_DISPENSA, "1");
    } catch {
      /* modo privado: some nesta sessão e volta na próxima, tudo bem */
    }
  }

  async function aceitar() {
    const ok = await ativar();
    // Só marca como dispensado quando deu certo. Se a permissão falhou, o card
    // sai de cena pelo próprio estado ("bloqueado") e não deve voltar mesmo.
    if (ok) dispensar();
  }

  // Nada de convite antes de existir um agendamento — é o que dá sentido ao aviso.
  const temAgendado = (data?.counts.scheduled ?? 0) > 0;
  const instalarNoIOS = estado === "precisa-instalar";
  const visivel = !dispensado && temAgendado && (estado === "off" || instalarNoIOS);

  return (
    <AnimatePresence>
      {visivel && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-3 bottom-[calc(0.75rem_+_env(safe-area-inset-bottom))] z-40 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96"
        >
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-xl">
            <button
              onClick={dispensar}
              aria-label="Dispensar"
              className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X size={14} />
            </button>

            <div className="flex gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Bell size={17} />
              </div>
              <div className="min-w-0 pr-5">
                <p className="text-[13.5px] font-semibold">Te aviso quando publicar</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  {instalarNoIOS
                    ? "Para receber avisos no iPhone, toque em Compartilhar › Adicionar à Tela de Início e abra o Postline por lá."
                    : "Receba um aviso assim que seu post agendado for publicado — mesmo com o app fechado."}
                </p>
              </div>
            </div>

            <div className="mt-3.5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={dispensar}>
                {instalarNoIOS ? "Entendi" : "Agora não"}
              </Button>
              {!instalarNoIOS && (
                <Button size="sm" onClick={() => void aceitar()} loading={ocupado}>
                  Ativar
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
