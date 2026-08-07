"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Estado e ações de Web Push deste dispositivo. Compartilhado pelo switch das
 * configurações e pelo card que oferece a ativação depois do primeiro
 * agendamento — os dois precisam do mesmo fluxo de permissão.
 */

export type PushEstado =
  | "carregando"
  /** Navegador sem suporte (inclui iOS anterior ao 16.4). */
  | "indisponivel"
  /** Servidor sem chaves VAPID configuradas. */
  | "sem-config"
  /** O service worker não ficou pronto a tempo — app precisa ser reaberto. */
  | "sw-ausente"
  /** iOS fora do PWA: só falta instalar na tela de início. */
  | "precisa-instalar"
  /** O usuário já negou. Irreversível pelo app. */
  | "bloqueado"
  | "off"
  | "on";

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

/** Usada só para escolher o texto de recuperação quando a permissão foi negada. */
export type Plataforma = "ios" | "android" | "desktop";

export function detectarPlataforma(): Plataforma {
  if (typeof navigator === "undefined") return "desktop";
  if (isIOS()) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}

function lerPermissao(): NotificationPermission | null {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  return Notification.permission;
}

export function usePush() {
  const [estado, setEstado] = useState<PushEstado>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [plataforma, setPlataforma] = useState<Plataforma>("desktop");

  /**
   * Última permissão observada. É o que distingue "o usuário acabou de liberar
   * nos ajustes do sistema" de "a permissão sempre esteve liberada" — sem isso,
   * reinscreveríamos automaticamente quem desligou o switch de propósito, e o
   * desligar viraria impossível.
   */
  const permAnterior = useRef<NotificationPermission | null>(null);

  useEffect(() => {
    permAnterior.current = lerPermissao();
    setPlataforma(detectarPlataforma());
  }, []);

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
      // O `PwaRegister` registra o service worker no evento `load` da janela,
      // que pode acontecer DEPOIS deste efeito — num PWA em cold start é o caso
      // comum. Consultar `getRegistration()` na hora acusaria "sem suporte" por
      // pura corrida. `ready` espera o registro; o timeout evita travar em
      // "Verificando…" onde SW nenhum vai aparecer (desenvolvimento).
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]);
      if (!reg) {
        setEstado("sw-ausente");
        return;
      }

      const sub = await reg.pushManager.getSubscription();
      // O servidor é a fonte da verdade: o navegador pode ter inscrição local
      // sem linha no banco (troca de conta, limpeza de dados). E é aqui que
      // descobrimos se o servidor tem chaves VAPID.
      const res = await fetch(
        `/api/push/subscribe${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ""}`
      );
      const data = (await res.json()) as { configured: boolean; subscribed: boolean };
      if (!data.configured) {
        setEstado("sem-config");
        return;
      }
      setEstado(sub && data.subscribed ? "on" : "off");
    } catch {
      setEstado("off");
    }
  }, []);

  useEffect(() => {
    void sincronizar();
  }, [sincronizar]);

  /** Retorna `true` se terminou inscrito. Deve ser chamado de dentro de um clique. */
  const ativar = useCallback(async (): Promise<boolean> => {
    setOcupado(true);
    try {
      // Precisa vir de um gesto do usuário — o iOS ignora o pedido feito fora
      // de um clique, e o Chrome penaliza o site.
      const permissao = await Notification.requestPermission();
      // Registrar aqui é o que impede o `aoMudarPermissao` de tratar esta
      // ativação como "liberou nos ajustes" no próximo retorno ao foco e
      // reinscrever de novo, disparando outro push de confirmação.
      permAnterior.current = permissao;
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "off");
        toast.error("Permissão não concedida.");
        return false;
      }

      const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chave) {
        toast.error("Push não configurado no servidor.");
        setEstado("sem-config");
        return false;
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
      return true;
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível ativar as notificações.");
      void sincronizar();
      return false;
    } finally {
      setOcupado(false);
    }
  }, [sincronizar]);

  const desativar = useCallback(async () => {
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
  }, []);

  /**
   * Reage a uma permissão que mudou fora do app (o usuário foi nos ajustes do
   * sistema e liberou). Só reinscreve na **transição** para "granted"; se já
   * estava liberada, apenas reconfere o estado.
   */
  const aoMudarPermissao = useCallback(async () => {
    const atual = lerPermissao();
    const anterior = permAnterior.current;
    permAnterior.current = atual;
    if (atual === "granted" && anterior !== null && anterior !== "granted") {
      // `ativar` chama requestPermission, que com a permissão já concedida
      // resolve na hora sem popup — e não exige gesto do usuário.
      await ativar();
      return;
    }
    if (atual !== anterior) await sincronizar();
  }, [ativar, sincronizar]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let ativo = true;
    let removerPermissions: (() => void) | null = null;

    // Caminho preferido: o navegador avisa na hora em que a permissão muda.
    (async () => {
      try {
        const status = await navigator.permissions?.query({ name: "notifications" as PermissionName });
        if (!status || !ativo) return;
        const handler = () => void aoMudarPermissao();
        status.addEventListener("change", handler);
        removerPermissions = () => status.removeEventListener("change", handler);
      } catch {
        /* Safari antigo lança para o nome "notifications" — o fallback cobre */
      }
    })();

    // Fallback (e rede de segurança): reconferir quando o app volta ao foco,
    // que é exatamente o momento em que o usuário retorna dos ajustes.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void aoMudarPermissao();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      ativo = false;
      removerPermissions?.();
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [aoMudarPermissao]);

  return { estado, ocupado, plataforma, ativar, desativar, sincronizar };
}
