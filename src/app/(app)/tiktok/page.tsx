"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Heart, MessageCircle, Eye, Share2, ExternalLink, Music2, Timer } from "lucide-react";
import { Button, Badge, EmptyState, fmt, timeAgo } from "@/components/ui";
import { toast } from "sonner";

type Video = {
  id: string;
  account: string;
  title: string;
  description: string;
  coverUrl: string | null;
  shareUrl: string;
  durationSeconds: number;
  createdAt: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
};

const duracao = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function TikTokPage() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async (aviso = false) => {
    setLoading(true);
    try {
      const res = await fetch("/api/tiktok/videos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setVideos(data.videos ?? []);
      setNoAccount(Boolean(data.noAccount));
      setFetchedAt(data.fetchedAt ?? null);
      setErro(data.error ?? null);
      // Resposta 200 com erro por conta: a listagem veio vazia por um motivo,
      // e o usuário precisa saber qual.
      if (data.error) toast.error(data.error);
      else if (aviso) toast.success("Vídeos atualizados do TikTok.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  // As métricas só existem se a conta tiver acesso a elas — quando vierem
  // zeradas em tudo, mostrar seis zeros seria pior que não mostrar.
  const temMetricas = (videos ?? []).some((v) => v.views + v.likes + v.comments + v.shares > 0);

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Vídeos do TikTok</h2>
          <p className="text-[12.5px] text-muted">
            As publicações reais da conta conectada.
            {fetchedAt && <span> Atualizado {timeAgo(fetchedAt)}.</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} loading={loading}>
          <RefreshCw size={14} /> Atualizar
        </Button>
      </div>

      {erro && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-[12.5px] text-danger">
          {erro}
        </div>
      )}

      {noAccount ? (
        <EmptyState
          icon={<Music2 />}
          title="Nenhuma conta do TikTok conectada"
          description="Conecte uma conta em Clientes para ver seus vídeos e publicar por aqui."
        />
      ) : videos && videos.length === 0 && !loading ? (
        <EmptyState icon={<Music2 />} title="Nenhum vídeo encontrado" description="Quando você publicar no TikTok, os vídeos aparecem aqui." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {(videos ?? Array.from({ length: 5 }).map(() => null)).map((v, i) =>
            v ? (
              <a key={v.id} href={v.shareUrl || undefined} target="_blank" rel="noopener noreferrer"
                className="group overflow-hidden rounded-2xl border border-border bg-surface transition-shadow hover:shadow-md">
                <div className="relative aspect-[9/16] bg-surface-2">
                  {v.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                  )}
                  {v.durationSeconds > 0 && (
                    <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10.5px] font-medium text-white tnum">
                      <Timer size={10} /> {duracao(v.durationSeconds)}
                    </span>
                  )}
                  <div className="absolute left-2 top-2"><Badge tone="neutral">@{v.account}</Badge></div>
                </div>
                <div className="space-y-2 p-3">
                  <p className="line-clamp-2 text-[12px] leading-snug">{v.title || v.description || <span className="text-muted">Sem título</span>}</p>
                  {temMetricas && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted tnum">
                      <span className="flex items-center gap-1"><Eye size={11} /> {fmt(v.views)}</span>
                      <span className="flex items-center gap-1"><Heart size={11} /> {fmt(v.likes)}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={11} /> {fmt(v.comments)}</span>
                      <span className="flex items-center gap-1"><Share2 size={11} /> {fmt(v.shares)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>{v.createdAt ? timeAgo(v.createdAt) : ""}</span>
                    <span className="flex items-center gap-1 font-medium text-accent">Ver <ExternalLink size={10} /></span>
                  </div>
                </div>
              </a>
            ) : (
              <div key={i} className="skeleton h-80 rounded-2xl" />
            )
          )}
        </div>
      )}
    </div>
  );
}
