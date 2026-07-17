"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox as InboxIcon, MessageSquare, AtSign, Mail, Search, Star, Archive, ArchiveRestore,
  Send, CheckCheck, Clock, ChevronLeft, Trash2,
} from "lucide-react";
import { cn, Button, Badge, Avatar, PlatformChip, EmptyState, inputCls, timeAgo, PLATFORM_META } from "@/components/ui";
import type { InboxItem } from "@/lib/types";
import { toast } from "sonner";

const TYPES = [
  { v: "all", l: "Todos", icon: InboxIcon },
  { v: "comment", l: "Comentários", icon: MessageSquare },
  { v: "message", l: "Mensagens", icon: Mail },
  { v: "mention", l: "Menções", icon: AtSign },
] as const;

const TYPE_LABEL: Record<string, string> = { comment: "Comentário", message: "Mensagem", mention: "Menção" };

export default function InboxPage() {
  const [type, setType] = useState<string>("all");
  const [platform, setPlatform] = useState<string>("all");
  const [status, setStatus] = useState<string>("open"); // open | archived | favorites
  const [q, setQ] = useState("");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const PAGE = 15;

  const buildQuery = useCallback((offset: number) => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (type !== "all") p.set("type", type);
    if (platform !== "all") p.set("platform", platform);
    if (status === "archived") p.set("status", "archived");
    if (status === "favorites") p.set("favorites", "1");
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [type, platform, status, q]);

  const load = useCallback(async (reset = true) => {
    if (reset) { setLoading(true); offsetRef.current = 0; } else setLoadingMore(true);
    const res = await fetch(`/api/inbox?${buildQuery(offsetRef.current)}`);
    if (res.ok) {
      const data = await res.json();
      setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
      setHasMore(data.hasMore);
      setUnread(data.unread);
      offsetRef.current += PAGE;
    }
    setLoading(false); setLoadingMore(false);
  }, [buildQuery]);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting && hasMore && !loading && !loadingMore) load(false); }, { rootMargin: "300px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, load]);

  async function patch(id: string, body: Record<string, unknown>, msg?: string) {
    const res = await fetch(`/api/inbox/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return toast.error("Não foi possível concluir.");
    const data = await res.json();
    if (msg) toast.success(msg);
    setSelected((s) => (s?.id === id ? data.item : s));
    load(true);
    window.dispatchEvent(new CustomEvent("postline:workspace-changed"));
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSending(true);
    await patch(selected.id, { reply: reply.trim() }, "Resposta enviada.");
    setReply("");
    setSending(false);
  }

  function open(item: InboxItem) {
    setSelected(item);
    if (item.status === "unread") patch(item.id, { status: "read" });
  }

  return (
    <div className="grid grid-cols-1 gap-4 animate-fade-up xl:grid-cols-[220px_330px_1fr] lg:grid-cols-[200px_300px_1fr]">
      {/* Filter rail */}
      <div className="space-y-4 xl:sticky xl:top-19 xl:self-start">
        <div>
          <p className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-muted/70">Tipo</p>
          {TYPES.map((t) => (
            <button key={t.v} onClick={() => setType(t.v)} className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition",
              type === t.v ? "bg-accent-soft text-accent" : "text-foreground/80 hover:bg-surface-2"
            )}>
              <t.icon size={15} /> {t.l}
            </button>
          ))}
        </div>
        <div>
          <p className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-muted/70">Rede</p>
          <div className="flex flex-wrap gap-1.5 px-2">
            <FilterPill active={platform === "all"} onClick={() => setPlatform("all")}>Todas</FilterPill>
            {Object.entries(PLATFORM_META).map(([k, v]) => (
              <FilterPill key={k} active={platform === k} onClick={() => setPlatform(k)}>{v.name}</FilterPill>
            ))}
          </div>
        </div>
        <div>
          <p className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-muted/70">Estado</p>
          <div className="flex flex-wrap gap-1.5 px-2">
            <FilterPill active={status === "open"} onClick={() => setStatus("open")}>Abertos</FilterPill>
            <FilterPill active={status === "favorites"} onClick={() => setStatus("favorites")}>Favoritos</FilterPill>
            <FilterPill active={status === "archived"} onClick={() => setStatus("archived")}>Arquivados</FilterPill>
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface lg:max-h-[calc(100dvh-120px)]">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoas, mensagens…" className={cn(inputCls, "h-9 pl-9 text-[13px]")} aria-label="Buscar na caixa de entrada" />
          </div>
          <div className="mt-2 flex items-center justify-between px-1">
            <span className="text-[11.5px] text-muted tnum">{unread} não lida(s)</span>
            <button onClick={() => Promise.all(items.filter((i) => i.status === "unread").slice(0, 10).map((i) => patch(i.id, { status: "read" }))).then(() => toast.success("Tudo marcado como lido."))}
              className="text-[11.5px] font-medium text-accent hover:underline">
              Marcar tudo como lido
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton mx-3 my-2 h-16" />)}
          {!loading && items.length === 0 && (
            <div className="p-6"><EmptyState icon={<CheckCheck size={20} />} title="Tudo em dia" description="Nenhum item com os filtros atuais." /></div>
          )}
          {!loading && items.map((item) => (
            <button key={item.id} onClick={() => open(item)}
              className={cn(
                "flex w-full gap-3 border-b border-border px-3.5 py-3 text-left transition hover:bg-surface-2/60",
                selected?.id === item.id && "bg-accent-soft/50",
                item.status === "unread" && "bg-surface-2/40"
              )}>
              <div className="relative shrink-0">
                <Avatar name={item.authorName} color={item.authorColor} size={36} />
                <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-surface"><PlatformChip platform={item.platform} size={10} /></span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn("truncate text-[12.5px]", item.status === "unread" ? "font-semibold" : "font-medium")}>{item.authorName}</p>
                  {item.isFavorite && <Star size={10} className="shrink-0 text-amber-400" fill="currentColor" />}
                  <span className="ml-auto shrink-0 text-[10.5px] text-muted">{timeAgo(item.createdAt)}</span>
                </div>
                <p className={cn("mt-0.5 line-clamp-2 text-[12px] leading-snug", item.status === "unread" ? "text-foreground/90" : "text-muted")}>{item.text}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge tone={item.type === "mention" ? "accent" : "neutral"} className="px-1.5 py-0 text-[10px]">{TYPE_LABEL[item.type]}</Badge>
                </div>
              </div>
              {item.status === "unread" && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />}
            </button>
          ))}
          <div ref={sentinelRef} className="py-3 text-center">
            {loadingMore && <span className="text-[11.5px] text-muted">Carregando…</span>}
          </div>
        </div>
      </div>

      {/* Detail */}
      <div className={cn(
        "fixed inset-0 z-40 flex-col bg-surface lg:static lg:z-auto lg:flex lg:max-h-[calc(100dvh-120px)] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border",
        selected ? "flex" : "hidden"
      )}>
        {!selected ? (
          <div className="hidden h-full items-center justify-center p-8 lg:flex">
            <EmptyState icon={<Mail size={22} />} title="Selecione uma conversa" description="Escolha um item para ver detalhes e responder." />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <button className="rounded-lg p-1.5 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setSelected(null)} aria-label="Voltar"><ChevronLeft size={17} /></button>
              <Avatar name={selected.authorName} color={selected.authorColor} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold">{selected.authorName}</p>
                <p className="truncate text-[11.5px] text-muted">@{selected.authorHandle} · {PLATFORM_META[selected.platform].name}</p>
              </div>
              <button onClick={() => patch(selected.id, { isFavorite: !selected.isFavorite }, selected.isFavorite ? "Removido dos favoritos." : "Adicionado aos favoritos.")}
                className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-amber-400" aria-label="Favoritar">
                <Star size={15} fill={selected.isFavorite ? "currentColor" : "none"} className={selected.isFavorite ? "text-amber-400" : ""} />
              </button>
              {selected.status === "archived" ? (
                <button onClick={() => patch(selected.id, { status: "read" }, "Desarquivado.")} className="rounded-lg p-2 text-muted transition hover:bg-surface-2" aria-label="Desarquivar"><ArchiveRestore size={15} /></button>
              ) : (
                <button onClick={() => { patch(selected.id, { status: "archived" }, "Arquivado."); setSelected(null); }} className="rounded-lg p-2 text-muted transition hover:bg-surface-2" aria-label="Arquivar"><Archive size={15} /></button>
              )}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {selected.postPreview && (
                <div className="rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5">
                  <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted"><MessageSquare size={10} /> Sobre a publicação</p>
                  <p className="mt-1 truncate text-[12px]">{selected.postPreview}</p>
                </div>
              )}
              <div className="flex gap-3">
                <Avatar name={selected.authorName} color={selected.authorColor} size={30} />
                <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-border bg-surface-2/70 px-3.5 py-2.5">
                  <p className="text-[13px] leading-relaxed">{selected.text}</p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-muted"><Clock size={9} /> {timeAgo(selected.createdAt)}</p>
                </div>
              </div>
              <AnimatePresence>
                {(selected.replies ?? []).map((r, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-row-reverse gap-3">
                    <Avatar name={r.by} color="#AB2F5F" size={30} />
                    <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-accent px-3.5 py-2.5 text-white">
                      <p className="text-[13px] leading-relaxed">{r.text}</p>
                      <p className="mt-1 text-right text-[10px] text-white/70">você · {timeAgo(r.at)}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={reply} onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder={`Responder ${selected.type === "message" ? "mensagem" : "comentário"}…`}
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] outline-none transition focus:border-accent focus:ring-[3px] focus:ring-accent/15"
                  aria-label="Escrever resposta"
                />
                <Button onClick={sendReply} loading={sending} disabled={!reply.trim()} size="icon" className="h-10 w-10" aria-label="Enviar resposta"><Send size={15} /></Button>
              </div>
              <p className="mt-1.5 px-1 text-[10.5px] text-muted">Enter para enviar · Shift+Enter para quebrar linha</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn(
      "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition",
      active ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:border-border-strong hover:text-foreground"
    )}>
      {children}
    </button>
  );
}
