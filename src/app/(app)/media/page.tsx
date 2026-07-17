"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Folder as FolderIcon, FolderPlus, Heart, Images, Search, Star, Trash2, Upload,
  LayoutGrid, RotateCcw, Tag, X, Check, ImagePlus, Clock,
} from "lucide-react";
import { cn, Button, Badge, Modal, EmptyState, inputCls, labelCls, Dropdown, fmt, timeAgo } from "@/components/ui";
import type { MediaItem, Folder } from "@/lib/types";
import { toast } from "sonner";

type ViewKey = "all" | "favorites" | "trash" | `folder:${string}`;

export default function MediaPage() {
  const [view, setView] = useState<ViewKey>("all");
  const [type, setType] = useState<string>("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const PAGE = 24;

  const buildQuery = useCallback((offset: number) => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (view === "favorites") p.set("favorites", "1");
    if (view === "trash") p.set("trash", "1");
    if (view.startsWith("folder:")) p.set("folder", view.slice(7));
    if (type !== "all") p.set("type", type);
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [view, type, q]);

  const load = useCallback(async (reset = true) => {
    if (reset) { setLoading(true); offsetRef.current = 0; } else setLoadingMore(true);
    const res = await fetch(`/api/media?${buildQuery(offsetRef.current)}`);
    if (res.ok) {
      const data = await res.json();
      setItems((prev) => (reset ? data.media : [...prev, ...data.media]));
      setFolders(data.folders);
      setTotal(data.total);
      setHasMore(data.hasMore);
      offsetRef.current += PAGE;
    }
    setLoading(false);
    setLoadingMore(false);
  }, [buildQuery]);

  useEffect(() => { load(true); }, [load]);

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) load(false);
    }, { rootMargin: "400px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, load]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files).slice(0, 8)) {
      if (file.size > 700_000) { toast.error(`“${file.name}” excede 700KB (limite demo).`); continue; }
      const dataUrl = await new Promise<string>((res2, rej) => {
        const r = new FileReader(); r.onload = () => res2(r.result as string); r.onerror = rej; r.readAsDataURL(file);
      });
      const res = await fetch("/api/media", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, url: dataUrl, type: file.type.startsWith("video") ? "video" : "image", sizeKb: Math.floor(file.size / 1024) }),
      });
      if (res.ok) ok++;
    }
    if (ok) { toast.success(`${ok} arquivo(s) enviado(s).`); load(true); }
    setUploading(false);
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createFolder", name }) });
    toast.success(`Pasta “${name}” criada.`);
    setFolderName(""); setNewFolder(false); load(true);
  }

  async function act(id: string, body: Record<string, unknown>, msg: string) {
    const res = await fetch(`/api/media/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { toast.success(msg); setSelected(null); load(true); }
  }

  const inTrash = view === "trash";

  return (
    <div className="grid grid-cols-1 gap-5 animate-fade-up lg:grid-cols-[210px_1fr]">
      {/* Sidebar: folders */}
      <div className="space-y-1 lg:sticky lg:top-19 lg:self-start">
        <p className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-widest text-muted/70">Coleções</p>
        <SideBtn active={view === "all"} onClick={() => setView("all")} icon={<LayoutGrid size={15} />}>Todas as mídias</SideBtn>
        <SideBtn active={view === "favorites"} onClick={() => setView("favorites")} icon={<Star size={15} />}>Favoritas</SideBtn>
        <p className="px-2 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-widest text-muted/70">Pastas</p>
        {folders.map((f) => (
          <SideBtn key={f.id} active={view === `folder:${f.id}`} onClick={() => setView(`folder:${f.id}`)} icon={<FolderIcon size={15} style={{ color: f.color }} />}>
            <span className="truncate">{f.name}</span>
          </SideBtn>
        ))}
        <button onClick={() => setNewFolder(true)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-muted transition hover:bg-surface-2 hover:text-foreground">
          <FolderPlus size={15} /> Nova pasta
        </button>
        <div className="pt-4">
          <SideBtn active={view === "trash"} onClick={() => setView("trash")} icon={<Trash2 size={15} />}>Lixeira</SideBtn>
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-52 flex-1 sm:max-w-80">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou tag…" className={cn(inputCls, "pl-10")} aria-label="Buscar mídia" />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
            {[{ v: "all", l: "Tudo" }, { v: "image", l: "Imagens" }, { v: "video", l: "Vídeos" }].map((t) => (
              <button key={t.v} onClick={() => setType(t.v)}
                className={cn("rounded-lg px-3 py-1.5 text-[12px] font-medium transition", type === t.v ? "bg-foreground text-background" : "text-muted hover:text-foreground")}>
                {t.l}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[12px] text-muted tnum sm:block">{total} itens</span>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }} />
            <Button onClick={() => fileRef.current?.click()} loading={uploading}><Upload size={14} /> Upload</Button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton aspect-square" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={inTrash ? <Trash2 size={22} /> : <ImagePlus size={22} />}
            title={inTrash ? "Lixeira vazia" : "Nenhuma mídia por aqui"}
            description={inTrash ? "Itens excluídos aparecem aqui por 30 dias." : "Envie imagens e vídeos para usar nas suas publicações."}
            action={!inTrash ? <Button onClick={() => fileRef.current?.click()}><Upload size={14} /> Enviar arquivos</Button> : undefined}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((m, i) => (
                <motion.div
                  key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i % PAGE, 12) * 0.025 }}
                  className={cn("group relative aspect-square cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface", m.trashedAt && "opacity-70")}
                  onClick={() => setSelected(m)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" loading="lazy" />
                  {m.isFavorite && <span className="absolute left-2 top-2 rounded-md bg-black/55 p-1 text-amber-300"><Star size={11} fill="currentColor" /></span>}
                  <div className="absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-2.5 pt-8 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                    <p className="truncate text-[11.5px] font-medium text-white">{m.name}</p>
                    <p className="text-[10px] text-white/70">{fmt(m.sizeKb)} KB · {timeAgo(m.createdAt)}</p>
                  </div>
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    {!inTrash && (
                      <button
                        onClick={(e) => { e.stopPropagation(); act(m.id, { isFavorite: !m.isFavorite }, m.isFavorite ? "Removida dos favoritos." : "Adicionada aos favoritos."); }}
                        className="rounded-lg bg-white/90 p-1.5 text-gray-700 transition hover:bg-white" aria-label="Favoritar">
                        <Heart size={12} fill={m.isFavorite ? "currentColor" : "none"} className={m.isFavorite ? "text-accent" : ""} />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
            <div ref={sentinelRef} className="py-4 text-center">
              {loadingMore && <span className="text-[12px] text-muted">Carregando mais…</span>}
              {!hasMore && items.length > 12 && <span className="text-[11.5px] text-muted/60">Fim da biblioteca</span>}
            </div>
          </>
        )}
      </div>

      {/* New folder */}
      <Modal open={newFolder} onClose={() => setNewFolder(false)} title="Nova pasta" subtitle="Organize suas mídias por campanha ou tema">
        <div className="space-y-4 p-5">
          <div>
            <label className={labelCls} htmlFor="folder-name">Nome da pasta</label>
            <input id="folder-name" className={inputCls} placeholder="Ex.: Campanha de inverno" value={folderName} onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createFolder()} autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNewFolder(false)}>Cancelar</Button>
            <Button onClick={createFolder}><Check size={14} /> Criar pasta</Button>
          </div>
        </div>
      </Modal>

      {/* Detail */}
      <MediaDetail
        item={selected} folders={folders} onClose={() => setSelected(null)}
        onPatch={act}
        onDelete={async (id, permanent) => {
          await fetch(`/api/media/${id}${permanent ? "?permanent=1" : ""}`, { method: "DELETE" });
          toast.success(permanent ? "Mídia excluída permanentemente." : "Mídia movida para a lixeira.");
          setSelected(null); load(true);
        }}
      />
    </div>
  );
}

function SideBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn(
      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition",
      active ? "bg-accent-soft text-accent" : "text-foreground/80 hover:bg-surface-2 hover:text-foreground"
    )}>
      {icon} {children}
    </button>
  );
}

function MediaDetail({ item, folders, onClose, onPatch, onDelete }: {
  item: MediaItem | null; folders: Folder[];
  onClose: () => void;
  onPatch: (id: string, body: Record<string, unknown>, msg: string) => void;
  onDelete: (id: string, permanent: boolean) => void;
}) {
  const [tags, setTags] = useState("");
  const [name, setName] = useState("");
  useEffect(() => { setTags(item?.tags.join(", ") ?? ""); setName(item?.name ?? ""); }, [item]);
  if (!item) return null;
  const trashed = !!item.trashedAt;

  return (
    <Modal open={!!item} onClose={onClose} width="max-w-3xl">
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="flex items-center justify-center bg-surface-2/50 p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt={item.name} className="max-h-105 w-auto rounded-xl object-contain" />
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className={labelCls}>Nome</label>
            <div className="flex gap-2">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="outline" size="icon" aria-label="Salvar nome" onClick={() => onPatch(item.id, { name }, "Nome atualizado.")}><Check size={14} /></Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12.5px]">
            <div className="rounded-xl bg-surface-2/70 p-3"><p className="text-muted">Tamanho</p><p className="mt-0.5 font-semibold tnum">{fmt(item.sizeKb)} KB</p></div>
            <div className="rounded-xl bg-surface-2/70 p-3"><p className="text-muted">Enviada</p><p className="mt-0.5 font-semibold">{timeAgo(item.createdAt)}</p></div>
          </div>
          <div>
            <label className={labelCls}>Pasta</label>
            <select className={inputCls} value={item.folderId ?? ""} onChange={(e) => onPatch(item.id, { folderId: e.target.value || null }, "Mídia movida.")}>
              <option value="">Sem pasta</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}><Tag size={11} className="mr-1 inline" />Tags (separadas por vírgula)</label>
            <div className="flex gap-2">
              <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="campanha, produto…" />
              <Button variant="outline" size="icon" aria-label="Salvar tags" onClick={() => onPatch(item.id, { tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }, "Tags atualizadas.")}><Check size={14} /></Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!trashed ? (
              <>
                <Button variant="soft" size="sm" onClick={() => onPatch(item.id, { isFavorite: !item.isFavorite }, item.isFavorite ? "Removida dos favoritos." : "Adicionada aos favoritos.")}>
                  <Heart size={13} fill={item.isFavorite ? "currentColor" : "none"} /> {item.isFavorite ? "Desfavoritar" : "Favoritar"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(item.url); toast.success("URL copiada."); }}>
                  Copiar URL
                </Button>
                <Button variant="danger" size="sm" className="ml-auto" onClick={() => onDelete(item.id, false)}><Trash2 size={13} /> Lixeira</Button>
              </>
            ) : (
              <>
                <Button variant="soft" size="sm" onClick={() => onPatch(item.id, { action: "restore" }, "Mídia restaurada.")}><RotateCcw size={13} /> Restaurar</Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(item.id, true)}><Trash2 size={13} /> Excluir definitivamente</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
