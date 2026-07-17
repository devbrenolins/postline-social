"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays, ListChecks, LayoutGrid,
  Pencil, Copy, Send, Ban, Trash2, Clock, Heart, Eye, MessageCircle, Share2, Bookmark, Filter,
} from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  isSameMonth, isSameDay, format, isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  cn, Button, Badge, Modal, Segmented, PlatformChip, POST_STATUS, fmt, inputCls, labelCls, Dropdown, EmptyState,
} from "@/components/ui";
import type { Post, PlatformT } from "@/lib/types";
import { useWorkspace } from "@/components/workspace-context";
import { useComposer } from "@/components/composer";
import { toast } from "sonner";
import { PLATFORM_META } from "@/components/ui";

type View = "month" | "list" | "kanban";

export default function CalendarPage() {
  const { data: ws } = useWorkspace();
  const { open: openComposer } = useComposer();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date());
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<PlatformT | "all">("all");
  const [clientId, setClientId] = useState<string>("all");
  const [selected, setSelected] = useState<Post | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/posts?limit=500");
    if (res.ok) setPosts((await res.json()).posts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const fn = () => load();
    window.addEventListener("postline:posts-changed", fn);
    return () => window.removeEventListener("postline:posts-changed", fn);
  }, [load]);

  const filtered = useMemo(() => posts.filter((p) =>
    (platform === "all" || p.networks.includes(platform)) &&
    (clientId === "all" || p.clientId === clientId) &&
    p.status !== "cancelled"
  ), [posts, platform, clientId]);

  async function patch(id: string, body: Record<string, unknown>, msg?: string) {
    const res = await fetch(`/api/posts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      if (msg) toast.success(msg);
      setSelected(null);
      load();
      window.dispatchEvent(new CustomEvent("postline:posts-changed"));
    } else toast.error("Não foi possível concluir a ação.");
  }

  async function onDropPost(postId: string, dayIso: string, targetStatus?: "draft" | "scheduled") {
    const post = posts.find((p) => p.id === postId);
    if (!post || post.status === "published") return;
    const base = post.scheduledAt ? new Date(post.scheduledAt) : new Date();
    const [y, m, d] = dayIso.split("-").map(Number);
    const next = new Date(y, m - 1, d, targetStatus === "scheduled" && !post.scheduledAt ? 10 : base.getHours(), targetStatus === "scheduled" && !post.scheduledAt ? 0 : base.getMinutes());
    if (targetStatus === "draft") {
      await patch(postId, { status: "draft", scheduledAt: null }, "Movido para rascunhos.");
      return;
    }
    if (post.scheduledAt && isSameDay(new Date(post.scheduledAt), next) && !targetStatus) return;
    await patch(postId, { status: "scheduled", scheduledAt: next.toISOString() }, `Reagendado para ${format(next, "dd/MM 'às' HH'h'")}.`);
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            { value: "month", label: "Mês" },
            { value: "list", label: "Lista" },
            { value: "kanban", label: "Kanban" },
          ]}
        />
        {view === "month" && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Mês anterior"><ChevronLeft size={15} /></Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Hoje</Button>
            <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Próximo mês"><ChevronRight size={15} /></Button>
            <h2 className="ml-2 min-w-36 text-[15px] font-semibold capitalize">{format(cursor, "MMMM yyyy", { locale: ptBR })}</h2>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-muted" />
          <select value={platform} onChange={(e) => setPlatform(e.target.value as PlatformT | "all")} className={cn(inputCls, "h-8.5 w-auto text-[12.5px]")} aria-label="Filtrar por rede">
            <option value="all">Todas as redes</option>
            {Object.entries(PLATFORM_META).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={cn(inputCls, "h-8.5 w-auto text-[12.5px]")} aria-label="Filtrar por cliente">
            <option value="all">Todos os clientes</option>
            {(ws?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button size="sm" onClick={() => openComposer({ date: view === "month" ? format(cursor, "yyyy-MM-dd") : undefined })}>
            <Plus size={14} /> Criar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20 w-full" />)}</div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {view === "month" && (
              <MonthView
                cursor={cursor} posts={filtered} dragOverDay={dragOverDay} setDragOverDay={setDragOverDay}
                onSelect={setSelected} onDropPost={onDropPost} onNew={(day) => openComposer({ date: day })}
                clientColor={(id) => ws?.clients.find((c) => c.id === id)?.color}
              />
            )}
            {view === "list" && <ListView posts={filtered} onSelect={setSelected} clientColor={(id) => ws?.clients.find((c) => c.id === id)?.color} onNew={() => openComposer()} />}
            {view === "kanban" && <KanbanView posts={filtered} onSelect={setSelected} onDropPost={onDropPost} onNew={() => openComposer()} />}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Post detail */}
      <PostDetail post={selected} onClose={() => setSelected(null)} clientName={ws?.clients.find((c) => c.id === selected?.clientId)?.name}
        onEdit={(p) => { setSelected(null); openComposer({ post: p }); }}
        onPatch={patch} />
    </div>
  );
}

/* -------------------------------- Month view -------------------------------- */
function MonthView({ cursor, posts, onSelect, onDropPost, onNew, dragOverDay, setDragOverDay, clientColor }: {
  cursor: Date; posts: Post[]; onSelect: (p: Post) => void;
  onDropPost: (id: string, dayIso: string) => void; onNew: (dayIso: string) => void;
  dragOverDay: string | null; setDragOverDay: (v: string | null) => void;
  clientColor: (id: string | null) => string | undefined;
}) {
  const monthStart = startOfMonth(cursor);
  const days: Date[] = [];
  let day = startOfWeek(monthStart, { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 });
  while (day <= end) { days.push(day); day = addDays(day, 1); }

  const postsOn = (d: Date) =>
    posts.filter((p) => {
      const when = p.scheduledAt ?? p.publishedAt ?? p.createdAt;
      return when && isSameDay(new Date(when), d);
    });

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const iso = format(d, "yyyy-MM-dd");
          const dayPosts = postsOn(d);
          const inMonth = isSameMonth(d, monthStart);
          return (
            <div
              key={iso}
              onDragOver={(e) => { e.preventDefault(); setDragOverDay(iso); }}
              onDragLeave={() => setDragOverDay(null)}
              onDrop={(e) => { e.preventDefault(); setDragOverDay(null); const id = e.dataTransfer.getData("postline/post"); if (id) onDropPost(id, iso); }}
              className={cn(
                "group relative min-h-27 border-b border-r border-border p-1.5 transition-colors sm:min-h-32",
                (i % 7 === 6) && "border-r-0",
                !inMonth && "bg-surface-2/40",
                dragOverDay === iso && "bg-accent-soft/60 ring-2 ring-inset ring-accent/40"
              )}
            >
              <div className="flex items-center justify-between px-1">
                <span className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11.5px] font-medium tnum",
                  isToday(d) ? "bg-accent font-semibold text-white" : inMonth ? "text-foreground" : "text-muted/50"
                )}>
                  {format(d, "d")}
                </span>
                <button
                  onClick={() => onNew(iso)}
                  className="rounded-md border border-border bg-surface p-1 text-muted opacity-100 shadow-sm transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  aria-label={`Nova publicação em ${format(d, "dd/MM")}`}
                >
                  <Plus size={13} />
                </button>
              </div>
              <div className="mt-1 space-y-1">
                {dayPosts.slice(0, 3).map((p) => {
                  const when = p.scheduledAt ?? p.publishedAt;
                  const draggable = p.status !== "published";
                  return (
                    <button
                      key={p.id}
                      draggable={draggable}
                      onDragStart={(e) => { e.dataTransfer.setData("postline/post", p.id); e.dataTransfer.effectAllowed = "move"; }}
                      onClick={() => onSelect(p)}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left transition-all hover:shadow-sm",
                        p.status === "published" ? "border-border bg-surface-2/70" : "border-transparent hover:brightness-95",
                        draggable && "cursor-grab active:cursor-grabbing"
                      )}
                      style={p.status !== "published" ? { background: `${clientColor(p.clientId) ?? "#8a8fa3"}14`, borderColor: `${clientColor(p.clientId) ?? "#8a8fa3"}30` } : undefined}
                    >
                      {p.mediaUrls[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.mediaUrls[0]} alt="" className="h-5 w-5 shrink-0 rounded-[5px] object-cover" loading="lazy" />
                      ) : <span className="h-5 w-5 shrink-0 rounded-[5px] bg-surface-2" />}
                      <span className="hidden min-w-0 flex-1 sm:block">
                        <span className="block truncate text-[10.5px] font-medium leading-tight">{p.caption || "Sem legenda"}</span>
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        {when && <span className="hidden text-[9.5px] font-medium text-muted tnum xl:inline">{format(new Date(when), "HH:mm")}</span>}
                        <PlatformChip platform={p.networks[0]} size={10} />
                      </span>
                    </button>
                  );
                })}
                {dayPosts.length > 3 && (
                  <p className="px-1 text-[10px] font-medium text-muted">+{dayPosts.length - 3} mais</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------- List view -------------------------------- */
function ListView({ posts, onSelect, clientColor, onNew }: {
  posts: Post[]; onSelect: (p: Post) => void; clientColor: (id: string | null) => string | undefined; onNew: () => void;
}) {
  const scheduled = posts.filter((p) => p.status === "scheduled").sort((a, b) => +new Date(a.scheduledAt!) - +new Date(b.scheduledAt!));
  const drafts = posts.filter((p) => p.status === "draft");
  const published = posts.filter((p) => p.status === "published").sort((a, b) => +new Date(b.publishedAt!) - +new Date(a.publishedAt!)).slice(0, 30);

  if (posts.length === 0) {
    return <EmptyState icon={<CalendarDays size={22} />} title="Nenhuma publicação encontrada" description="Ajuste os filtros ou crie sua primeira publicação."
      action={<Button onClick={onNew}><Plus size={14} /> Nova publicação</Button>} />;
  }

  return (
    <div className="space-y-6">
      <Section title="Agendadas" count={scheduled.length} icon={<Clock size={14} className="text-info" />}>
        {scheduled.map((p) => <ListRow key={p.id} post={p} when={p.scheduledAt} onClick={() => onSelect(p)} color={clientColor(p.clientId)} />)}
      </Section>
      <Section title="Rascunhos" count={drafts.length} icon={<Pencil size={14} className="text-muted" />}>
        {drafts.map((p) => <ListRow key={p.id} post={p} when={null} onClick={() => onSelect(p)} color={clientColor(p.clientId)} />)}
      </Section>
      <Section title="Publicadas" count={published.length} icon={<Send size={14} className="text-success" />}>
        {published.map((p) => <ListRow key={p.id} post={p} when={p.publishedAt} onClick={() => onSelect(p)} color={clientColor(p.clientId)} />)}
      </Section>
    </div>
  );
}

function Section({ title, count, icon, children }: { title: string; count: number; icon: React.ReactNode; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-muted">{icon} {title} <span className="rounded-full bg-surface-2 px-1.5 py-px text-[11px] tnum">{count}</span></h3>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">{children}</div>
    </div>
  );
}

function ListRow({ post, when, onClick, color }: { post: Post; when: string | null; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3.5 border-b border-border px-4 py-3 text-left transition last:border-b-0 hover:bg-surface-2/60">
      <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: color ?? "var(--border-strong)" }} />
      {post.mediaUrls[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.mediaUrls[0]} alt="" className="h-11 w-11 rounded-lg object-cover" loading="lazy" />
      ) : <span className="h-11 w-11 rounded-lg bg-surface-2" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{post.caption || "Sem legenda"}</span>
        <span className="mt-0.5 block text-[11.5px] text-muted tnum">
          {when ? format(new Date(when), "EEEE, dd 'de' MMMM '·' HH:mm", { locale: ptBR }) : "Sem data definida"}
        </span>
      </span>
      <span className="hidden gap-1 sm:flex">{post.networks.slice(0, 3).map((n) => <PlatformChip key={n} platform={n} size={12} />)}</span>
      <Badge tone={POST_STATUS[post.status].tone}>{POST_STATUS[post.status].label}</Badge>
    </button>
  );
}

/* -------------------------------- Kanban view -------------------------------- */
function KanbanView({ posts, onSelect, onDropPost, onNew }: {
  posts: Post[]; onSelect: (p: Post) => void; onDropPost: (id: string, iso: string, status?: "draft" | "scheduled") => void; onNew: () => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const cols: { key: "draft" | "scheduled" | "published"; title: string; dot: string; hint?: string }[] = [
    { key: "draft", title: "Rascunho", dot: "var(--muted)" },
    { key: "scheduled", title: "Agendado", dot: "var(--info)" },
    { key: "published", title: "Publicado", dot: "var(--success)" },
  ];
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {cols.map((col) => {
        const items = posts
          .filter((p) => p.status === col.key)
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        const isDrop = col.key !== "published";
        return (
          <div
            key={col.key}
            onDragOver={isDrop ? (e) => { e.preventDefault(); setOver(col.key); } : undefined}
            onDragLeave={isDrop ? () => setOver(null) : undefined}
            onDrop={isDrop ? (e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("postline/post"); if (id) onDropPost(id, col.key === "scheduled" ? tomorrow : "", col.key as "draft" | "scheduled"); } : undefined}
            className={cn(
              "flex min-h-60 flex-col rounded-2xl border border-border bg-surface-2/50 p-3 transition-colors",
              over === col.key && "border-accent/50 bg-accent-soft/40"
            )}
          >
            <div className="mb-3 flex items-center gap-2 px-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
              <h3 className="text-[13px] font-semibold">{col.title}</h3>
              <span className="rounded-full bg-surface px-1.5 py-px text-[11px] font-semibold text-muted tnum">{items.length}</span>
              {col.key === "draft" && (
                <button onClick={onNew} className="ml-auto rounded-md p-1 text-muted transition hover:bg-surface hover:text-accent" aria-label="Novo rascunho"><Plus size={14} /></button>
              )}
            </div>
            <div className="flex-1 space-y-2.5 overflow-y-auto">
              {items.length === 0 && (
                <div className="rounded-xl border border-dashed border-border-strong py-8 text-center text-[12px] text-muted">
                  {isDrop ? "Arraste publicações para cá" : "Nada publicado ainda"}
                </div>
              )}
              {items.map((p) => (
                <motion.div
                  key={p.id} layout layoutId={p.id}
                  draggable={p.status !== "published"}
                  onDragStart={(e) => { (e as unknown as React.DragEvent).dataTransfer?.setData("postline/post", p.id); }}
                  onClick={() => onSelect(p)}
                  className={cn(
                    "cursor-pointer overflow-hidden rounded-xl border border-border bg-surface transition-shadow hover:shadow-md",
                    p.status !== "published" && "cursor-grab active:cursor-grabbing"
                  )}
                >
                  {p.mediaUrls[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.mediaUrls[0]} alt="" className="aspect-[16/8] w-full object-cover" loading="lazy" />
                  )}
                  <div className="p-3">
                    <p className="line-clamp-2 text-[12.5px] leading-snug">{p.caption || "Sem legenda"}</p>
                    <div className="mt-2.5 flex items-center justify-between">
                      <div className="flex gap-1">{p.networks.slice(0, 3).map((n) => <PlatformChip key={n} platform={n} size={11} />)}</div>
                      <span className="text-[10.5px] font-medium text-muted tnum">
                        {p.scheduledAt ? format(new Date(p.scheduledAt), "dd/MM HH'h'") : p.publishedAt ? format(new Date(p.publishedAt), "dd/MM") : "—"}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------- Post detail -------------------------------- */
function PostDetail({ post, onClose, onEdit, onPatch, clientName }: {
  post: Post | null; onClose: () => void; onEdit: (p: Post) => void;
  onPatch: (id: string, body: Record<string, unknown>, msg?: string) => void;
  clientName?: string;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => setConfirmDel(false), [post]);
  if (!post) return null;
  const when = post.scheduledAt ?? post.publishedAt;

  return (
    <Modal open={!!post} onClose={onClose} title="Detalhes da publicação" subtitle={clientName} width="max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr]">
        <div className="bg-surface-2/60 p-4">
          {post.mediaUrls[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.mediaUrls[0]} alt="" className="aspect-square w-full rounded-xl object-cover" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-surface-2 text-muted"><LayoutGrid size={22} /></div>
          )}
          {post.mediaUrls.length > 1 && (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {post.mediaUrls.slice(1, 5).map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt="" className="aspect-square rounded-lg object-cover" loading="lazy" />
              ))}
            </div>
          )}
        </div>
        <div className="p-5">
          <div className="flex items-center gap-2">
            <Badge tone={POST_STATUS[post.status].tone}>{POST_STATUS[post.status].label}</Badge>
            <Badge>{post.format === "feed" ? "Feed" : post.format}</Badge>
            {when && (
              <span className="text-[11.5px] text-muted tnum">
                {format(new Date(when), "dd 'de' MMM '·' HH:mm", { locale: ptBR })}
              </span>
            )}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed">{post.caption || <span className="text-muted">Sem legenda</span>}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">{post.networks.map((n) => <PlatformChip key={n} platform={n} size={12} />)}</div>

          {post.status === "published" && post.metrics && (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {[
                { icon: Heart, v: post.metrics.likes, l: "Curtidas" },
                { icon: MessageCircle, v: post.metrics.comments, l: "Coment." },
                { icon: Share2, v: post.metrics.shares, l: "Compart." },
                { icon: Bookmark, v: post.metrics.saves, l: "Salvos" },
                { icon: Eye, v: post.metrics.reach, l: "Alcance" },
              ].map((m) => (
                <div key={m.l} className="rounded-xl bg-surface-2/70 px-2.5 py-2 text-center">
                  <m.icon size={13} className="mx-auto text-accent" />
                  <p className="mt-1 text-[13px] font-semibold tnum">{fmt(m.v)}</p>
                  <p className="text-[9.5px] text-muted">{m.l}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {post.status !== "published" && (
              <>
                <Button variant="outline" size="sm" onClick={() => onEdit(post)}><Pencil size={13} /> Editar</Button>
                <Button variant="soft" size="sm" onClick={() => onPatch(post.id, { action: "publish" }, "Publicado agora.")}><Send size={13} /> Publicar agora</Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => onPatch(post.id, { action: "duplicate" }, "Publicação duplicada como rascunho.")}><Copy size={13} /> Duplicar</Button>
            {post.status === "scheduled" && (
              <Button variant="outline" size="sm" onClick={() => onPatch(post.id, { action: "cancel" }, "Agendamento cancelado.")}><Ban size={13} /> Cancelar</Button>
            )}
            {!confirmDel ? (
              <Button variant="ghost" size="sm" className="ml-auto text-danger hover:bg-danger/10" onClick={() => setConfirmDel(true)}><Trash2 size={13} /> Excluir</Button>
            ) : (
              <Button variant="danger" size="sm" className="ml-auto" onClick={async () => {
                await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
                toast.success("Publicação excluída.");
                window.dispatchEvent(new CustomEvent("postline:posts-changed"));
                onClose();
              }}>
                Confirmar exclusão
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
