"use client";

import { useEffect } from "react";

/** Registra o service worker do PWA (apenas em produção e se suportado). */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* falha silenciosa: o app continua funcionando sem offline */
      });
    };
    // Num PWA já aberto (ou em navegação client-side) o evento `load` pode ter
    // acontecido antes deste efeito montar — esperar por ele deixaria o service
    // worker sem registrar, e o push indisponível sem motivo aparente.
    if (document.readyState === "complete") {
      registrar();
      return;
    }
    window.addEventListener("load", registrar);
    return () => window.removeEventListener("load", registrar);
  }, []);
  return null;
}
