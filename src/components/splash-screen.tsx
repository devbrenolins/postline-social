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
    // O HTML já veio com o splash pintado; ao hidratar a interface está pronta,
    // então some na hora (só um respiro de ~1 frame para não piscar). Antes havia
    // um mínimo fixo de 650 ms que atrasava TODA abertura, mesmo com o app pronto.
    let fadeTimer: ReturnType<typeof setTimeout>;
    const raf = requestAnimationFrame(() => {
      setFade(true);
      fadeTimer = setTimeout(() => setGone(true), 300);
    });
    return () => {
      cancelAnimationFrame(raf);
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
