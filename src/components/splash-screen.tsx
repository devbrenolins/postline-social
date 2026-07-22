"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/ui";

/**
 * Tela de abertura (splash) para o PWA. É renderizada já no HTML inicial, então
 * pinta instantaneamente e cobre aquele "flash" branco enquanto o app carrega.
 * Some suavemente assim que a interface está pronta.
 */
export function SplashScreen() {
  const [fade, setFade] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Garante um tempo mínimo de exibição (pra animação aparecer) e some quando
    // a página termina de carregar — o que vier por último.
    let fadeTimer: ReturnType<typeof setTimeout>;
    const start = () => {
      setFade(true);
      fadeTimer = setTimeout(() => setGone(true), 480);
    };
    const minTimer = setTimeout(start, 650);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(fadeTimer);
    };
  }, []);

  if (gone) return null;

  return (
    <div id="app-splash" className={fade ? "splash-hide" : ""} aria-hidden="true">
      <div className="splash-logo">
        <Logo size={88} />
      </div>
      <span className="splash-spin" />
    </div>
  );
}
