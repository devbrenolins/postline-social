"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Heart, MessageCircle, Eye, Bookmark, Share2, ExternalLink, Aperture, Repeat2 } from "lucide-react";
import { Button, Badge, EmptyState, fmt, timeAgo } from "@/components/ui";
import { toast } from "sonner";

type IgPost = {
  id: string; account: string; caption: string; mediaType: string; mediaUrl: string | null;
  permalink: string; timestamp: string; likes: number; comments: number; reach: number; saves: number; shares: number; views: number;
};

export default function InstagramFeedPage() {
  const [posts, setPosts] = useState<IgPost[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instagram/media${refresh ? "?refresh=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setPosts(data.posts ?? []);
      setFetchedAt(data.fetchedAt ?? null);
      setNoAccount(Boolean(data.noAccount));
      if (refresh) toast.success("Publicações atualizadas do Instagram.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const stats = (p: IgPost) => [
    { icon: Eye, label: "Alcance", value: p.reach },
    { icon: Repeat2, label: "Views", value: p.views },
    { icon: Heart, label: "Curtidas", value: p.likes },
    { icon: MessageCircle, label: "Coment.", value: p.comments },
    { icon: Bookmark, label: "Salvos", value: p.saves },
    { icon: Share2, label: "Compart.", value: p.shares },
  ];

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Feed do Instagram</h2>
          <p className="text-[12.5px] text-muted">
            Suas publicações reais e o engajamento delas, ao vivo — sempre que você precisar.
            {fetchedAt && <span> Atualizado {timeAgo(fetchedAt)}.</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} loading={loading}>
          <RefreshCw size={14} /> Atualizar
        </Button>
      </div>

      {noAccount ? (
        <EmptyState
          icon={<Aperture />}
          title="Nenhuma conta Instagram conectada"
          description="Conecte uma conta em Clientes para ver suas publicações e métricas aqui."
        />
      ) : posts && posts.length === 0 && !loading ? (
        <EmptyState icon={<Aperture />} title="Nenhuma publicação encontrada" description="Quando você publicar no Instagram, os posts aparecem aqui com as métricas." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(posts ?? Array.from({ length: 6 }).map(() => null)).map((p, i) =>
            p ? (
              <article key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="relative aspect-square w-full bg-surface-2">
                  {p.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.mediaUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted"><Aperture size={28} /></div>
                  )}
                  <div className="absolute left-2 top-2 flex gap-1.5">
                    <Badge tone="neutral">@{p.account}</Badge>
                    {p.mediaType && <Badge tone="info">{p.mediaType === "VIDEO" ? "Reel/Vídeo" : p.mediaType === "CAROUSEL_ALBUM" ? "Carrossel" : "Feed"}</Badge>}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-3.5">
                  <p className="line-clamp-2 text-[12.5px] leading-snug">{p.caption || <span className="text-muted">Sem legenda</span>}</p>
                  <div className="mt-auto grid grid-cols-3 gap-2">
                    {stats(p).map((s) => (
                      <div key={s.label} className="rounded-lg bg-surface-2/60 px-2 py-1.5">
                        <span className="flex items-center gap-1 text-[10px] text-muted"><s.icon size={11} /> {s.label}</span>
                        <p className="mt-0.5 text-[13px] font-semibold tnum">{fmt(s.value)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>{p.timestamp ? timeAgo(p.timestamp) : ""}</span>
                    {p.permalink && (
                      <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-accent hover:underline">
                        Ver no Instagram <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ) : (
              <div key={i} className="skeleton h-80 rounded-2xl" />
            )
          )}
        </div>
      )}
    </div>
  );
}
