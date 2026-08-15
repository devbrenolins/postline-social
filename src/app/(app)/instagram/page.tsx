"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Heart, MessageCircle, Eye, Bookmark, Share2, ExternalLink, Aperture, Repeat2, Timer, Link as LinkIcon } from "lucide-react";
import { Button, Badge, EmptyState, fmt, timeAgo } from "@/components/ui";
import { toast } from "sonner";

type IgPost = {
  id: string; account: string; caption: string; mediaType: string; productType: string; shortcode: string; mediaUrl: string | null;
  permalink: string; timestamp: string; likes: number; comments: number; reach: number; saves: number; shares: number; views: number;
  interactions: number; avgWatchTime: number; totalWatchTime: number; commentsEnabled: boolean;
  children: { id: string; mediaType: string; mediaUrl: string | null }[];
};
type Story = { id: string; mediaUrl: string | null; permalink: string; timestamp: string; reach: number; views: number; replies: number };
type Tagged = { id: string; username: string; caption: string; mediaUrl: string | null; permalink: string; timestamp: string; likeCount: number; commentsCount: number };
type Profile = { handle: string; accountType: string; biography: string; website: string; followers: number; follows: number; mediaCount: number };

/** Retenção vem em milissegundos. */
const watchTime = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}min ${Math.round((ms % 60_000) / 1000)}s` : `${(ms / 1000).toFixed(1).replace(".", ",")}s`);

export default function InstagramFeedPage() {
  const [posts, setPosts] = useState<IgPost[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [tagged, setTagged] = useState<Tagged[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [quota, setQuota] = useState<{ used: number; total: number } | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instagram/media${refresh ? "?refresh=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setPosts(data.posts ?? []);
      setFetchedAt(data.fetchedAt ?? null);
      setNoAccount(Boolean(data.noAccount));
      setStories(data.stories ?? []);
      setTagged(data.tagged ?? []);
      setProfile(data.profile ?? null);
      setQuota(data.quota ?? null);
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

  const mediaLabel = (p: IgPost) =>
    p.productType === "REELS" ? "Reels"
    : p.productType === "AD" ? "Anúncio"
    : p.mediaType === "CAROUSEL_ALBUM" ? `Carrossel · ${p.children.length}`
    : p.mediaType === "VIDEO" ? "Vídeo"
    : "Feed";

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

      {profile && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border bg-surface px-4 py-3 text-[12px]">
          <span className="font-semibold">@{profile.handle}</span>
          {profile.accountType && <Badge tone="neutral">{profile.accountType === "BUSINESS" ? "Comercial" : profile.accountType}</Badge>}
          <span className="text-muted"><b className="font-semibold text-foreground tnum">{fmt(profile.followers)}</b> seguidores</span>
          <span className="text-muted"><b className="font-semibold text-foreground tnum">{fmt(profile.follows)}</b> seguindo</span>
          <span className="text-muted"><b className="font-semibold text-foreground tnum">{fmt(profile.mediaCount)}</b> publicações</span>
          {profile.website && (
            <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-accent hover:underline">
              <LinkIcon size={11} /> {profile.website.replace(/^https?:\/\//, "")}
            </a>
          )}
          {quota && (
            <span className="ml-auto text-muted" title="Limite de publicações da API do Instagram nas últimas 24 horas">
              Cota de publicação: <b className="font-semibold text-foreground tnum">{quota.used}/{quota.total}</b>
            </span>
          )}
        </div>
      )}

      {stories.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-[13.5px] font-semibold">Stories no ar</h3>
          <p className="text-[12px] text-muted">O Instagram só devolve as últimas 24 horas — depois esse dado some para sempre.</p>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {stories.map((st) => (
              <a key={st.id} href={st.permalink || undefined} target="_blank" rel="noopener noreferrer"
                className="w-28 shrink-0">
                <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-border bg-surface-2">
                  {st.mediaUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={st.mediaUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted tnum">
                  <span className="flex items-center gap-1"><Eye size={10} /> {fmt(st.reach)}</span>
                  <span className="flex items-center gap-1"><MessageCircle size={10} /> {fmt(st.replies)}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {tagged.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-[13.5px] font-semibold">Marcaram você</h3>
          <p className="text-[12px] text-muted">Publicações de outros perfis que marcaram esta conta.</p>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {tagged.map((t) => (
              <a key={t.id} href={t.permalink || undefined} target="_blank" rel="noopener noreferrer" className="w-32 shrink-0">
                <div className="aspect-square overflow-hidden rounded-xl border border-border bg-surface-2">
                  {t.mediaUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.mediaUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <p className="mt-1.5 truncate text-[11.5px] font-medium">@{t.username}</p>
                <p className="text-[11px] text-muted tnum">{fmt(t.likeCount)} curtidas</p>
              </a>
            ))}
          </div>
        </div>
      )}

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
                    <Badge tone={p.productType === "AD" ? "warning" : "info"}>{mediaLabel(p)}</Badge>
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
                  {p.avgWatchTime > 0 && (
                    <p className="flex items-center gap-1.5 text-[11.5px] text-muted">
                      <Timer size={12} />
                      <span className="tnum"><b className="font-semibold text-foreground">{watchTime(p.avgWatchTime)}</b> assistidos em média</span>
                      <span className="ml-auto tnum">{watchTime(p.totalWatchTime)} no total</span>
                    </p>
                  )}
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
