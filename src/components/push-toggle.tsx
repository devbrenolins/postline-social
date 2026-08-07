"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Switch } from "@/components/ui";

/**
 * Ativa/desativa Web Push neste dispositivo.
 *
 * A inscrição é por aparelho, não por conta: ativar no celular não ativa no
 * desktop. O texto da UI diz isso porque a confusão é garantida caso contrário.
 */

/** A chave VAPID viaja em base64url e o `pushManager` exige bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normal);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** PWA instalado (tela de início). Requisito do iOS para push existir. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

type Estado = "carregando" | "indisponivel" | "precisa-instalar" | "bloqueado" | "off" | "on";

export function PushToggle() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);

  const sincronizar = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      // No iOS o PushManager só existe dentro do PWA instalado. Distinguir os
      // dois casos evita dizer "seu navegador não suporta" para quem só precisa
      // adicionar à tela de início.
      setEstado(isIOS() && !isStandalone() ? "precisa-instalar" : "indisponivel");
      return;
    }
    if (Notification.permission === "denied") {
      setEstado("bloqueado");
      return;
    }
    try {
      // `serviceWorker.ready` fica pendente para sempre quando não há SW
      // registrado — é o caso em desenvolvimento, onde o PwaRegister não roda.
      // Checar a existência antes evita travar a UI em "Verificando…".
      const existente = await navigator.serviceWorker.getRegistration();
      if (!existente) {
        setEstado("indisponivel");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setEstado("off");
        return;
      }
      // O navegador pode ter inscrição local sem linha no banco (troca de conta,
      // limpeza de dados). O servidor é a fonte da verdade.
      const res = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`);
      const data = (await res.json()) as { configured: boolean; subscribed: boolean };
      if (!data.configured) setEstado("indisponivel");
      else setEstado(data.subscribed ? "on" : "off");
    } catch {
      setEstado("off");
    }
  }, []);

  useEffect(() => {
    void sincronizar();
  }, [sincronizar]);

  async function ativar() {
    setOcupado(true);
    try {
      // Precisa vir de um gesto do usuário — o iOS ignora o pedido feito fora
      // de um clique, e o Chrome penaliza o site.
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "off");
        toast.error("Permissão não concedida.");
        return;
      }

      const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chave) {
        toast.error("Push não configurado no servidor.");
        setEstado("indisponivel");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          // Obrigatório: o navegador recusa inscrição que não mostra
          // notificação visível ao usuário.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(chave) as BufferSource,
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("falha ao registrar");

      setEstado("on");
      toast.success("Notificações ativadas neste dispositivo.");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível ativar as notificações.");
      void sincronizar();
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado("off");
      toast.success("Notificações desativadas neste dispositivo.");
    } catch {
      toast.error("Não foi possível desativar.");
    } finally {
      setOcupado(false);
    }
  }

  const textos: Record<Estado, string> = {
    carregando: "Verificando…",
    indisponivel: "Este navegador não suporta notificações push.",
    "precisa-instalar": "No iPhone, toque em Compartilhar › Adicionar à Tela de Início e abra o Postline por lá para ativar.",
    bloqueado: "Bloqueado nas permissões do navegador. Libere as notificações do site e recarregue.",
    off: "Receba avisos mesmo com o app fechado. Vale só para este dispositivo.",
    on: "Ativas neste dispositivo.",
  };

  const podeAlternar = estado === "on" || estado === "off";

  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">Notificações push</p>
        <p className="text-[11.5px] text-muted">{textos[estado]}</p>
      </div>
      {podeAlternar ? (
        <Switch
          checked={estado === "on"}
          onChange={(v) => (v ? ativar() : desativar())}
          label="Notificações push"
        />
      ) : estado === "bloqueado" ? (
        <Button size="sm" variant="outline" onClick={() => void sincronizar()} disabled={ocupado}>
          Verificar
        </Button>
      ) : null}
    </div>
  );
}
