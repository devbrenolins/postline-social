"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, Plus, Search, Check } from "lucide-react";
import { cn, Button, Badge, Modal, EmptyState, PlatformChip, inputCls, labelCls, fmt } from "@/components/ui";
import type { Client } from "@/lib/types";
import { toast } from "sonner";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/clients");
    if (res.ok) setClients((await res.json()).clients);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.industry.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-80">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar clientes…" className={cn(inputCls, "pl-10")} aria-label="Buscar clientes" />
        </div>
        <div className="ml-auto">
          <Button onClick={() => setCreating(true)}><Plus size={15} /> Novo cliente</Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-44" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Briefcase size={22} />} title="Nenhum cliente encontrado" description="Cadastre marcas para organizar contas, posts e relatórios."
          action={<Button onClick={() => setCreating(true)}><Plus size={14} /> Cadastrar cliente</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c, i) => (
            <motion.button
              key={c.id} onClick={() => setSelected(c)}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="group rounded-2xl border border-border bg-surface p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-[15px] font-bold text-white" style={{ background: c.color }}>
                  {c.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                </span>
                <Badge tone={c.status === "active" ? "success" : "neutral"}>{c.status === "active" ? "Ativo" : "Pausado"}</Badge>
              </div>
              <h3 className="mt-3.5 text-[15px] font-semibold">{c.name}</h3>
              <p className="text-[12px] text-muted">{c.industry || "Sem segmento"} · Resp. {c.responsible || "—"}</p>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5">
                <div className="flex gap-1.5">
                  {(c.accounts ?? []).slice(0, 4).map((a) => <PlatformChip key={a.id} platform={a.platform} size={12} />)}
                  {(c.accounts ?? []).length === 0 && <span className="text-[11px] text-muted">Nenhuma conta</span>}
                </div>
                <span className="text-[11.5px] font-medium text-muted tnum">
                  {fmt((c.accounts ?? []).reduce((s, a) => s + a.followers, 0))} seguidores
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <ClientModal client={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); load(); }} />
      <CreateModal open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />
    </div>
  );
}

/* ------------------------------- Client detail ------------------------------- */
function ClientModal({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setNotes(client?.notes ?? ""); }, [client]);
  if (!client) return null;

  function autosave(value: string) {
    setNotes(value);
    setSaving("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await fetch(`/api/clients/${client!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: value }) });
      setSaving("saved");
    }, 900);
  }

  return (
    <Modal open={!!client} onClose={onClose} title={client.name} subtitle={client.industry} width="max-w-xl">
      <div className="space-y-5 p-5">
        <div>
          <p className="mb-2 text-[12.5px] font-semibold">Redes sociais</p>
          <div className="space-y-2">
            {(client.accounts ?? []).map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-2.5">
                <PlatformChip platform={a.platform} size={13} />
                <div className="flex-1">
                  <p className="text-[13px] font-medium">@{a.handle}</p>
                  <p className="text-[11px] text-muted tnum">{fmt(a.followers)} seguidores</p>
                </div>
                <Badge tone={a.connected ? "success" : "warning"}>{a.connected ? "Conectada" : "Expirada"}</Badge>
              </div>
            ))}
            {(client.accounts ?? []).length === 0 && <p className="text-[12.5px] text-muted">Nenhuma conta vinculada ainda.</p>}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[12.5px] font-semibold">Notas internas</p>
            {saving !== "idle" && (
              <span className="flex items-center gap-1 text-[11px] text-muted">
                {saving === "saving" ? "Salvando…" : <><Check size={11} className="text-success" /> Salvo</>}
              </span>
            )}
          </div>
          <textarea
            value={notes} onChange={(e) => autosave(e.target.value)} rows={4}
            placeholder="Preferências do cliente, acordos, observações de aprovação…"
            className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-3 text-[13px] leading-relaxed outline-none transition focus:border-accent focus:ring-[3px] focus:ring-accent/15"
          />
        </div>

        <div className="flex justify-between border-t border-border pt-4">
          <Button variant="ghost" className="text-danger hover:bg-danger/10" onClick={async () => {
            await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
            toast.success("Cliente removido.");
            onSaved();
          }}>Excluir cliente</Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------- Create client ------------------------------- */
function CreateModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", industry: "", responsible: "" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setBusy(false);
    if (res.ok) { toast.success(`Cliente “${form.name}” criado.`); setForm({ name: "", industry: "", responsible: "" }); onSaved(); }
    else toast.error("Não foi possível criar o cliente.");
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo cliente" subtitle="Cadastre uma marca para gerenciar">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div>
          <label className={labelCls}>Nome do cliente *</label>
          <input className={inputCls} required placeholder="Ex.: Café Alma" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Segmento</label>
            <input className={inputCls} placeholder="Gastronomia" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Responsável</label>
            <input className={inputCls} placeholder="Nome do contato" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}><Check size={14} /> Criar cliente</Button>
        </div>
      </form>
    </Modal>
  );
}
