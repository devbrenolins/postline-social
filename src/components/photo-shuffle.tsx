"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/** Intervalo entre o início de duas trocas de grupo. */
const INTERVAL_MS = 6000;
/** Tempo que as cartas levam para ir ao centro antes de as fotos trocarem. */
const GATHER_MS = 650;

const COLS = 3;
const ROWS = 2;

/** Inclinação de cada carta empilhada no centro — dá cara de baralho sendo embaralhado. */
const TILT = [-11, 7, -5, 9, -8, 12];

function preload(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

/**
 * Vitrine de fotos que se "embaralha": a cada ciclo as seis cartas correm para o
 * centro, as fotos são trocadas enquanto estão empilhadas (ninguém vê o corte) e
 * as cartas voltam ao lugar já com o grupo novo.
 */
export function PhotoShuffle({ groups }: { groups: string[][] }) {
  const reduce = useReducedMotion();
  const [group, setGroup] = useState(0);
  const [stage, setStage] = useState<"spread" | "gather">("spread");
  const groupRef = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (groups.length < 2) return;
    // Aquece o cache com o próximo grupo para a troca nunca mostrar foto carregando.
    const warm = (idx: number) => groups[idx % groups.length].forEach((src) => void preload(src));
    warm(1);

    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      const next = (groupRef.current + 1) % groups.length;

      // Garante que as seis fotos novas estão prontas antes de embaralhar (máx. 2 s).
      const ready = Promise.all(groups[next].map(preload));
      setStage("gather");
      await Promise.all([new Promise((r) => setTimeout(r, GATHER_MS + 150)), Promise.race([ready, new Promise((r) => setTimeout(r, 2000))])]);

      groupRef.current = next;
      setGroup(next);
      setStage("spread");
      warm(next + 1);
      timers.push(setTimeout(() => { busy.current = false; }, 1100));
    };

    const id = setInterval(() => void tick(), INTERVAL_MS);
    return () => {
      clearInterval(id);
      timers.forEach(clearTimeout);
    };
  }, [groups]);

  return (
    <div
      className="relative mx-auto grid w-full grid-cols-3 gap-3.5 xl:gap-4"
      // A largura acompanha a ALTURA da janela: duas fileiras de fotos 3:4 ocupam ~83% da
      // largura, então 80vh de largura ≈ 66vh de altura e sobra espaço para a frase abaixo.
      style={{ maxWidth: "min(100%, 80vh, 900px)", perspective: 1200 }}
    >
      {groups[group].map((src, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const gather = stage === "gather";
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 24 }}
            animate={
              reduce
                ? { opacity: gather ? 0 : 1, y: 0 }
                : gather
                  ? {
                      opacity: 1,
                      // Em % do próprio tamanho: leva a carta ao centro da grade.
                      x: `${(1 - col) * 108}%`,
                      y: `${(0.5 - row) * 108}%`,
                      rotate: TILT[i],
                      scale: 0.8,
                    }
                  : { opacity: 1, x: "0%", y: "0%", rotate: 0, scale: 1 }
            }
            transition={
              gather
                ? { duration: GATHER_MS / 1000, delay: i * 0.025, ease: [0.6, 0.02, 0.2, 1] }
                : { type: "spring", stiffness: 150, damping: 16, mass: 0.9, delay: i * 0.06 }
            }
            className={`relative overflow-hidden rounded-2xl shadow-[0_18px_40px_-18px_rgba(0,0,0,0.65)] ${col === 1 ? "translate-y-7" : ""}`}
            style={{ aspectRatio: "3 / 4", zIndex: gather ? 10 + ((i * 7) % 6) : 1 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" draggable={false} decoding="async" className="h-full w-full select-none object-cover" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
          </motion.div>
        );
      })}
    </div>
  );
}
