"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, CalendarClock, Send, Save, Undo2, Redo2, ImagePlus, Trash2, Hash, Smile,
  Sparkles, ChevronLeft, ChevronRight, Loader2, Heart, MessageCircle, Bookmark,
  Share2, MoreHorizontal, Check, Film, Layers, FileText, MonitorPlay, StickyNote, Upload,
} from "lucide-react";
import { cn, Button, PlatformIcon, PlatformChip, PLATFORM_META, Badge, POST_STATUS, Avatar, inputCls, labelCls } from "@/components/ui";
import type { Post, MediaItem, PlatformT } from "@/lib/types";
import { useWorkspace } from "@/components/workspace-context";
import { toast } from "sonner";

/* --------------------------------- Context --------------------------------- */
type OpenOpts = { post?: Post; date?: string; onSaved?: () => void };
const ComposerContext = createContext<{ open: (opts?: OpenOpts) => void }>({ open: () => {} });
export const useComposer = () => useContext(ComposerContext);

export function ComposerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; opts: OpenOpts }>({ open: false, opts: {} });
  const open = useCallback((opts: OpenOpts = {}) => setState({ open: true, opts }), []);
  return (
    <ComposerContext.Provider value={{ open }}>
      <ComposerStateContext.Provider value={{ ...state, close: () => setState((s) => ({ ...s, open: false })) }}>
        {children}
      </ComposerStateContext.Provider>
    </ComposerContext.Provider>
  );
}

const ComposerStateContext = createContext<{ open: boolean; opts: OpenOpts; close: () => void }>({ open: false, opts: {}, close: () => {} });

/* ---------------------------------- Modal ---------------------------------- */
const FORMATS = [
  { value: "feed", label: "Feed", icon: MonitorPlay },
  { value: "carousel", label: "Carrossel", icon: Layers },
  { value: "story", label: "Stories", icon: StickyNote },
  { value: "reel", label: "Reels", icon: Film },
  { value: "pdf", label: "PDF", icon: FileText },
] as const;

const EMOJIS = ["✨", "🔥", "💡", "📌", "🤎", "🧡", "💪", "🥐", "☕", "🌿", "🏙️", "🍂", "🎬", "📖", "😍", "👏", "🙌", "💬", "🚀", "🎯", "🧭", "⛵", "🏔️", "🍜"];
const HASHTAG_BANK = ["#socialmedia", "#marketingdigital", "#conteudo", "#branding", "#lancamento", "#dicadodia", "#trend", "#reels", "#carrossel", "#bts"];

export function ComposerModal() {
  const { open: isOpen, opts, close } = useContext(ComposerStateContext);
  return (
    <AnimatePresence>
      {isOpen && <Editor key={opts.post?.id ?? opts.date ?? "new"} opts={opts} close={close} />}
    </AnimatePresence>
  );
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Editor({ opts, close }: { opts: OpenOpts; close: () => void }) {
  const { data: ws, refetch } = useWorkspace();
  const editing = opts.post;
  const [postId, setPostId] = useState<string | null>(editing?.id ?? null);
  const [status, setStatus] = useState<string>(editing?.status ?? "draft");
  const [clientId, setClientId] = useState<string>(editing?.clientId ?? ws?.clients[0]?.id ?? "");
  const [networks, setNetworks] = useState<PlatformT[]>(editing?.networks?.length ? editing.networks : ["instagram"]);
  const [format, setFormat] = useState<string>(editing?.format ?? "feed");
  const [caption, setCaption] = useState(editing?.caption ?? "");
  const [firstComment, setFirstComment] = useState(editing?.firstComment ?? "");
  const [mediaUrls, setMediaUrls] = useState<string[]>(editing?.mediaUrls ?? []);
  const [scheduledAt, setScheduledAt] = useState<string>(
    toLocalInput(editing?.scheduledAt) || (opts.date ? `${opts.date}T10:00` : "")
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [busy, setBusy] = useState<null | "draft" | "schedule" | "publish">(null);
  const [preview, setPreview] = useState<"instagram" | "x">("instagram");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  // Undo / redo for caption
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const [histVersion, setHistVersion] = useState(0);
  const applyCaption = useCallback((next: string, push = true) => {
    if (push) { undoStack.current.push(captionRef.current?.value ?? ""); redoStack.current = []; }
    setCaption(next);
    setHistVersion((v) => v + 1);
  }, []);

  // Autosave (apenas em edição de rascunhos/agendados existentes)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!postId || status === "published") return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/posts/${postId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, firstComment, networks, mediaUrls, format, clientId: clientId || null, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined }),
      });
      setSaveState("saved");
      window.dispatchEvent(new CustomEvent("postline:posts-changed"));
    }, 1100);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [caption, firstComment, networks, mediaUrls, format, clientId, scheduledAt, postId, status]);

  const charLimit = useMemo(
    () => Math.min(...networks.map((n) => PLATFORM_META[n].charLimit)),
    [networks]
  );
  const charPct = caption.length / charLimit;

  const client = ws?.clients.find((c) => c.id === clientId);
  const account = ws?.accounts.find((a) => a.clientId === clientId && networks.includes(a.platform)) ?? ws?.accounts[0];

  async function submit(target: "draft" | "schedule" | "publish") {
    if (target === "schedule" && !scheduledAt) return toast.error("Escolha data e hora para agendar.");
    if (networks.length === 0) return toast.error("Selecione ao menos uma rede social.");
    if (!caption.trim() && mediaUrls.length === 0) return toast.error("Escreva algo ou adicione mídia.");
    setBusy(target);
    try {
      const payload = {
        caption, firstComment, networks, mediaUrls, format, clientId: clientId || null,
        status: target === "schedule" ? "scheduled" : target === "publish" ? "published" : "draft",
        scheduledAt: target === "schedule" ? new Date(scheduledAt).toISOString() : null,
      };
      let id = postId;
      if (id) {
        await fetch(`/api/posts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (target === "publish") await fetch(`/api/posts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish" }) });
      } else {
        const res = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        id = data.post.id;
      }
      toast.success(target === "draft" ? "Rascunho salvo." : target === "schedule" ? "Publicação agendada." : "Publicado agora nas redes selecionadas.");
      window.dispatchEvent(new CustomEvent("postline:posts-changed"));
      refetch();
      opts.onSaved?.();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!postId) return close();
    await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    toast.success("Publicação excluída.");
    window.dispatchEvent(new CustomEvent("postline:posts-changed"));
    opts.onSaved?.();
    close();
  }

  function aiAssist(kind: "improve" | "hashtags" | "shorten" | "fix") {
    if (kind === "improve") {
      const t = caption.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      applyCaption(t.charAt(0).toUpperCase() + t.slice(1) + (t.endsWith(".") || t.endsWith("!") || t === "" ? "" : "."));
      toast.success("Texto aprimorado pela assistente.");
    }
    if (kind === "hashtags") {
      const words = caption.toLowerCase().match(/[a-zà-ú]{4,}/g) ?? [];
      const auto = [...new Set(words.slice(0, 3))].map((w) => `#${w.normalize("NFD").replace(/[̀-ͯ]/g, "")}`);
      const tags = [...auto, ...HASHTAG_BANK.slice(0, 3)].join(" ");
      applyCaption(caption.trim() + (caption.includes("#") ? " " + tags : "\n\n" + tags));
      toast.success("Hashtags sugeridas adicionadas.");
    }
    if (kind === "shorten") {
      const sentences = caption.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
      applyCaption(sentences.length < caption.length ? sentences.trim() : caption);
      toast.success("Versão curta aplicada.");
    }
    if (kind === "fix") {
      applyCaption(caption.replace(/\bvc\b/gi, "você").replace(/\bqdo\b/gi, "quando").replace(/\btbm\b/gi, "também").replace(/ {2,}/g, " ").replace(/\bi{3,}\b/gi, "ii"));
      toast.success("Ortografia revisada.");
    }
  }

  const canInteract = status !== "published";

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-5"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Editor de publicação">
      <motion.div
        initial={{ y: 30, opacity: 0, scale: 0.985 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.985 }}
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
        className="flex max-h-[94dvh] w-full max-w-245 flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-[14.5px] font-semibold">{editing ? "Editar publicação" : "Nova publicação"}</h2>
          <Badge tone={POST_STATUS[status]?.tone}>{POST_STATUS[status]?.label}</Badge>
          {editing && <span className="text-[11.5px] text-muted">v{editing.version}</span>}
          <div className="ml-auto flex items-center gap-2.5">
            {saveState !== "idle" && canInteract && (
              <span className="hidden items-center gap-1.5 text-[11.5px] text-muted sm:flex">
                {saveState === "saving" ? <><Loader2 size={11} className="animate-spin" /> Salvando…</> : <><Check size={11} className="text-success" /> Salvo automaticamente</>}
              </span>
            )}
            <button onClick={close} className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground" aria-label="Fechar editor">
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_330px]">
          {/* ------------------------------- Form ------------------------------ */}
          <div className="space-y-5 overflow-y-auto px-5 py-5">
            {/* Client */}
            <div>
              <label className={labelCls}>Cliente / marca</label>
              <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={!canInteract}>
                <option value="">Sem cliente</option>
                {(ws?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Networks */}
            <div>
              <label className={labelCls}>Publicar em</label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Redes sociais">
                {(Object.keys(PLATFORM_META) as PlatformT[]).map((p) => {
                  const active = networks.includes(p);
                  return (
                    <button
                      key={p} type="button" disabled={!canInteract} aria-pressed={active}
                      onClick={() => setNetworks((ns) => active ? ns.filter((n) => n !== p) : [...ns, p])}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-medium transition-all duration-150",
                        active ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:border-border-strong hover:text-foreground"
                      )}
                    >
                      <span style={{ color: active ? PLATFORM_META[p].color : undefined }}><PlatformIcon platform={p} size={14} /></span>
                      {PLATFORM_META[p].name}
                      {active && <Check size={12} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Format */}
            <div>
              <label className={labelCls}>Formato</label>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f.value} type="button" disabled={!canInteract}
                    onClick={() => setFormat(f.value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium transition-all",
                      format === f.value ? "border-foreground bg-foreground text-background" : "border-border text-muted hover:text-foreground"
                    )}
                  >
                    <f.icon size={13} /> {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Caption */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className={cn(labelCls, "mb-0")} htmlFor="caption">Legenda</label>
                {canInteract && (
                  <div className="flex items-center gap-1">
                    <button type="button" className="rounded-md p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
                      disabled={undoStack.current.length === 0 && histVersion >= 0 && undoStack.current.length === 0}
                      onClick={() => { if (undoStack.current.length) { redoStack.current.push(caption); const prev = undoStack.current.pop()!; setCaption(prev); setHistVersion(v => v + 1); } }}
                      aria-label="Desfazer" title="Desfazer">
                      <Undo2 size={14} />
                    </button>
                    <button type="button" className="rounded-md p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
                      disabled={redoStack.current.length === 0}
                      onClick={() => { if (redoStack.current.length) { undoStack.current.push(caption); const next = redoStack.current.pop()!; setCaption(next); setHistVersion(v => v + 1); } }}
                      aria-label="Refazer" title="Refazer">
                      <Redo2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <textarea
                ref={captionRef} id="caption" value={caption} disabled={!canInteract}
                onChange={(e) => applyCaption(e.target.value)}
                rows={6}
                placeholder="Escreva a legenda da publicação…"
                className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed outline-none transition-colors placeholder:text-muted/60 focus:border-accent focus:ring-[3px] focus:ring-accent/15"
              />
              {/* Toolbar */}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <ToolButton label="Hashtags" onClick={() => applyCaption(caption + (caption.endsWith(" ") || !caption ? "" : " ") + "#")}>
                  <Hash size={14} />
                </ToolButton>
                <div className="relative">
                  <ToolButton label="Emojis" onClick={() => setEmojiOpen((v) => !v)}><Smile size={14} /></ToolButton>
                  <AnimatePresence>
                    {emojiOpen && (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                        className="absolute z-10 mt-1 grid w-56 grid-cols-8 gap-0.5 rounded-xl border border-border bg-surface p-2 shadow-lg">
                        {EMOJIS.map((e) => (
                          <button key={e} type="button" className="rounded-md p-1 text-[15px] transition hover:bg-surface-2"
                            onClick={() => { applyCaption(caption + e); setEmojiOpen(false); }}>
                            {e}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="mx-1 h-4 w-px bg-border" />
                <span className="mr-0.5 flex items-center gap-1 text-[11px] font-medium text-muted"><Sparkles size={11} className="text-accent" /> Assistente</span>
                {(["improve", "hashtags", "shorten", "fix"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => aiAssist(k)}
                    className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted transition hover:border-accent/40 hover:text-accent">
                    {{ improve: "Melhorar", hashtags: "# Sugerir", shorten: "Encurtar", fix: "Corrigir" }[k]}
                  </button>
                ))}
                {/* Char count */}
                <div className="ml-auto flex items-center gap-2">
                  <svg width={22} height={22} viewBox="0 0 24 24" className="-rotate-90">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="var(--border)" strokeWidth="2.5" />
                    <circle cx="12" cy="12" r="9" fill="none" stroke={charPct > 1 ? "var(--danger)" : charPct > 0.85 ? "var(--warning)" : "var(--accent)"}
                      strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${Math.min(charPct, 1) * 56.5} 56.5`} />
                  </svg>
                  <span className={cn("text-[11.5px] tnum", charPct > 1 ? "font-semibold text-danger" : "text-muted")}>
                    {caption.length.toLocaleString("pt-BR")}/{charLimit.toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
            </div>

            {/* First comment */}
            <div>
              <label className={labelCls} htmlFor="first-comment">Primeiro comentário <span className="font-normal text-muted/60">(opcional)</span></label>
              <input id="first-comment" className={inputCls} placeholder="Hashtags extras ou CTA no primeiro comentário…" value={firstComment} onChange={(e) => setFirstComment(e.target.value)} disabled={!canInteract} />
            </div>

            {/* Media */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className={cn(labelCls, "mb-0")}>Mídia ({mediaUrls.length})</label>
                {canInteract && (
                  <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                    <ImagePlus size={13} /> Adicionar da biblioteca
                  </Button>
                )}
              </div>
              {mediaUrls.length === 0 ? (
                <button type="button" onClick={() => canInteract && setPickerOpen(true)}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong py-8 text-muted transition hover:border-accent/50 hover:text-accent">
                  <ImagePlus size={20} />
                  <span className="text-[12.5px] font-medium">Selecionar imagens ou vídeos</span>
                </button>
              ) : (
                <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
                  {mediaUrls.map((url, i) => (
                    <div key={url + i} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      {canInteract && (
                        <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/45 opacity-0 transition group-hover:opacity-100">
                          <button type="button" aria-label="Mover para esquerda" className="rounded-md bg-white/90 p-1 text-gray-800 disabled:opacity-30" disabled={i === 0}
                            onClick={() => setMediaUrls((m) => { const c = [...m]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })}>
                            <ChevronLeft size={12} />
                          </button>
                          <button type="button" aria-label="Remover" className="rounded-md bg-white/90 p-1 text-red-600"
                            onClick={() => setMediaUrls((m) => m.filter((_, j) => j !== i))}>
                            <Trash2 size={12} />
                          </button>
                          <button type="button" aria-label="Mover para direita" className="rounded-md bg-white/90 p-1 text-gray-800 disabled:opacity-30" disabled={i === mediaUrls.length - 1}
                            onClick={() => setMediaUrls((m) => { const c = [...m]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; return c; })}>
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      )}
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-px text-[9px] font-semibold text-white">{i + 1}</span>
                    </div>
                  ))}
                  {canInteract && (
                    <button type="button" onClick={() => setPickerOpen(true)}
                      className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border-strong text-muted transition hover:border-accent/50 hover:text-accent">
                      <ImagePlus size={18} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Schedule */}
            {canInteract && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="schedule">Agendar para</label>
                  <input id="schedule" type="datetime-local" className={cn(inputCls, "tnum")} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                </div>
                <div className="flex items-end pb-1">
                  <p className="flex items-center gap-1.5 text-[11.5px] text-muted">
                    <CalendarClock size={13} /> Fuso: {ws?.workspace.timezone?.replace("_", " ") ?? "America/Sao Paulo"} (GMT-3)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ------------------------------ Preview ------------------------------ */}
          <div className="hidden flex-col border-l border-border bg-surface-2/50 lg:flex">
            <div className="flex items-center justify-center gap-1 border-b border-border p-2.5">
              {(["instagram", "x"] as const).map((p) => (
                <button key={p} onClick={() => setPreview(p)}
                  className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition", preview === p ? "bg-foreground text-background" : "text-muted hover:text-foreground")}>
                  <PlatformIcon platform={p} size={12} /> {p === "instagram" ? "Instagram" : "X"}
                </button>
              ))}
            </div>
            <div className="flex flex-1 items-start justify-center overflow-y-auto p-5">
              <PhonePreview
                variant={preview}
                accountName={account?.displayName ?? client?.name ?? ws?.workspace.name ?? "Sua marca"}
                handle={account?.handle ?? "suamarca"}
                color={client?.color ?? ws?.workspace.color ?? "#AB2F5F"}
                caption={caption}
                mediaUrls={mediaUrls}
                format={format}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface px-5 py-3.5">
          {editing && status !== "published" && (
            <Button variant="ghost" size="md" className="text-danger hover:bg-danger/10" onClick={remove}>
              <Trash2 size={14} /> Excluir
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {canInteract && (
              <>
                <Button variant="outline" onClick={() => submit("draft")} loading={busy === "draft"}>
                  <Save size={14} /> Rascunho
                </Button>
                <Button variant="soft" onClick={() => submit("schedule")} loading={busy === "schedule"} disabled={!scheduledAt}>
                  <CalendarClock size={14} /> Agendar
                </Button>
                <Button onClick={() => submit("publish")} loading={busy === "publish"}>
                  <Send size={14} /> Publicar agora
                </Button>
              </>
            )}
          </div>
        </div>

        {pickerOpen && (
          <MediaPicker
            selected={mediaUrls}
            onToggle={(url) => setMediaUrls((m) => m.includes(url) ? m.filter((u) => u !== url) : [...m, url])}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </motion.div>
    </motion.div>
  );
}

function ToolButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground">
      {children}
    </button>
  );
}

/* ------------------------------ Phone preview ------------------------------- */
function renderCaption(text: string, max = 160) {
  const truncated = text.length > max ? text.slice(0, max) + "… " : text + " ";
  const parts = truncated.split(/(\s+)/);
  return parts.map((w, i) =>
    w.startsWith("#") || w.startsWith("@")
      ? <span key={i} className="font-medium" style={{ color: "#4F83AC" }}>{w}</span>
      : <React.Fragment key={i}>{w}</React.Fragment>
  );
}

function PhonePreview({ variant, accountName, handle, color, caption, mediaUrls, format }: {
  variant: "instagram" | "x"; accountName: string; handle: string; color: string; caption: string; mediaUrls: string[]; format: string;
}) {
  const [slide, setSlide] = useState(0);
  if (variant === "x") {
    return (
      <div className="w-full max-w-70 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex gap-2.5">
          <Avatar name={accountName} color={color} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight">{accountName} <span className="font-normal text-muted">@{handle} · agora</span></p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-snug">
              {caption ? renderCaption(caption, 280) : <span className="text-muted/60">Sua legenda aparece aqui…</span>}
            </p>
            {mediaUrls[0] && (
              <div className="mt-2.5 overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrls[0]} alt="" className="aspect-video w-full object-cover" />
              </div>
            )}
            <div className="mt-2.5 flex items-center justify-between text-muted">
              <MessageCircle size={14} /> <Share2 size={14} /> <Heart size={14} /> <Bookmark size={14} />
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="w-full max-w-70 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="rounded-full p-[2px]" style={{ background: "linear-gradient(45deg,#E8B44A,#C45C8E,#8B7FB8)" }}>
          <span className="block rounded-full bg-surface p-[2px]"><Avatar name={accountName} color={color} size={26} /></span>
        </span>
        <div className="flex-1 leading-tight">
          <p className="text-[12px] font-semibold">{handle}</p>
          <p className="text-[10px] text-muted">Original</p>
        </div>
        <MoreHorizontal size={15} className="text-muted" />
      </div>
      <div className={cn("relative bg-surface-2", format === "story" || format === "reel" ? "aspect-[9/16] max-h-85" : "aspect-square")}>
        {mediaUrls[slide] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrls[slide]} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted">
            <MonitorPlay size={22} />
            <span className="text-[11px]">Pré-visualização de mídia</span>
          </div>
        )}
        {mediaUrls.length > 1 && (
          <>
            <span className="absolute right-2 top-2 rounded-full bg-black/55 px-1.5 py-px text-[9.5px] font-semibold text-white">{slide + 1}/{mediaUrls.length}</span>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {mediaUrls.map((_, i) => (
                <button key={i} onClick={() => setSlide(i)} aria-label={`Mídia ${i + 1}`}
                  className={cn("h-1.5 w-1.5 rounded-full transition", i === slide ? "bg-white" : "bg-white/50")} />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-3.5 px-3 pt-2.5 text-foreground/85">
        <Heart size={19} /> <MessageCircle size={19} /> <Share2 size={19} />
        <span className="ml-auto"><Bookmark size={19} /></span>
      </div>
      <div className="px-3 pb-3.5 pt-2">
        <p className="text-[11.5px] font-semibold">1.284 curtidas</p>
        <p className="mt-1 text-[12px] leading-snug">
          <span className="mr-1.5 font-semibold">{handle}</span>
          {caption ? renderCaption(caption) : <span className="text-muted/60">Sua legenda aparece aqui…</span>}
          {caption.length > 160 && <button className="text-muted">mais</button>}
        </p>
        <p className="mt-1.5 text-[11px] text-muted">Ver todos os 48 comentários</p>
      </div>
    </div>
  );
}

/* ------------------------------ Media picker -------------------------------- */
function MediaPicker({ selected, onToggle, onClose }: { selected: string[]; onToggle: (url: string) => void; onClose: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/media?limit=60");
    if (res.ok) setItems((await res.json()).media);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        if (file.size > 700_000) { toast.error(`“${file.name}” excede 700KB (limite demo).`); continue; }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(file);
        });
        const res = await fetch("/api/media", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, url: dataUrl, type: file.type.startsWith("video") ? "video" : "image", sizeKb: Math.floor(file.size / 1024) }),
        });
        if (!res.ok) toast.error(`Falha ao enviar ${file.name}`);
      }
      await load();
      toast.success("Upload concluído.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="flex max-h-[80dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="text-[14px] font-semibold">Biblioteca de mídia</h3>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
              <Upload size={13} /> Upload
            </Button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Fechar"><X size={16} /></button>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2.5 overflow-y-auto p-4 sm:grid-cols-4">
          {loading && Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton aspect-square" />)}
          {!loading && items.map((m) => {
            const isSel = selected.includes(m.url);
            return (
              <button key={m.id} type="button" onClick={() => onToggle(m.url)}
                className={cn("group relative aspect-square overflow-hidden rounded-xl border-2 transition", isSel ? "border-accent" : "border-transparent hover:border-border-strong")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.name} className="h-full w-full object-cover" loading="lazy" />
                {isSel && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left text-[9.5px] text-white opacity-0 transition group-hover:opacity-100">
                  {m.name}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-[12px] text-muted">{selected.length} selecionada(s)</p>
          <Button size="sm" onClick={onClose}><Check size={14} /> Concluir</Button>
        </div>
      </motion.div>
    </div>
  );
}
