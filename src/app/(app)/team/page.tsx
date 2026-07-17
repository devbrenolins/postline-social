"use client";

import React, { useState } from "react";
import { UserPlus, Check, X, Shield, Pencil, Palette, Eye } from "lucide-react";
import { cn, Button, Badge, Modal, Avatar, inputCls, labelCls, Dropdown, timeAgo } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import type { Member } from "@/lib/types";
import { toast } from "sonner";
import { MoreHorizontal, Trash2 } from "lucide-react";

const ROLE_META: Record<string, { label: string; tone: "accent" | "info" | "warning" | "neutral"; desc: string; icon: React.ElementType }> = {
  admin: { label: "Administrador", tone: "accent", desc: "Acesso total, incluindo cobrança e exclusão do workspace", icon: Shield },
  editor: { label: "Editor", tone: "info", desc: "Cria, agenda e publica conteúdo em todas as contas", icon: Pencil },
  designer: { label: "Designer", tone: "warning", desc: "Gerencia a biblioteca de mídia e anexa assets aos posts", icon: Palette },
  client: { label: "Cliente", tone: "neutral", desc: "Visualiza calendário e aprova publicações da sua marca", icon: Eye },
};

const PERMISSIONS: { label: string; admin: boolean; editor: boolean; designer: boolean; client: boolean }[] = [
  { label: "Criar e editar publicações", admin: true, editor: true, designer: true, client: false },
  { label: "Publicar e agendar", admin: true, editor: true, designer: false, client: false },
  { label: "Gerenciar biblioteca de mídia", admin: true, editor: true, designer: true, client: false },
  { label: "Responder caixa de entrada", admin: true, editor: true, designer: false, client: false },
  { label: "Ver analytics e exportar", admin: true, editor: true, designer: false, client: true },
  { label: "Aprovar publicações", admin: true, editor: false, designer: false, client: true },
  { label: "Gerenciar equipe e permissões", admin: true, editor: false, designer: false, client: false },
  { label: "API, webhooks e integrações", admin: true, editor: false, designer: false, client: false },
];

export default function TeamPage() {
  const { data: ws, refetch } = useWorkspace();
  const [inviteOpen, setInviteOpen] = useState(false);

  async function action(body: Record<string, unknown>, msg: string) {
    const res = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { toast.success(msg); refetch(); }
    else toast.error("Não foi possível concluir.");
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Members */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-[14.5px] font-semibold">Membros da equipe</h3>
            <p className="text-[12px] text-muted tnum">{ws?.members.length ?? 0} pessoas no workspace</p>
          </div>
          <Button onClick={() => setInviteOpen(true)}><UserPlus size={15} /> Convidar</Button>
        </div>
        <div className="divide-y divide-border">
          {(ws?.members ?? []).map((m) => <MemberRow key={m.id} member={m} isSelf={m.email === ws?.user.email} onAction={action} />)}
          {!ws && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton mx-5 my-3 h-12" />)}
        </div>
      </div>

      {/* Roles matrix */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-[14.5px] font-semibold">Permissões por função</h3>
          <p className="text-[12px] text-muted">O que cada função pode fazer no workspace</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-3 pl-5 pr-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Permissão</th>
                {(Object.keys(ROLE_META) as (keyof typeof ROLE_META)[]).map((r) => {
                  const R = ROLE_META[r];
                  return (
                    <th key={r} className="px-3 py-3 text-center">
                      <span className="inline-flex flex-col items-center gap-1">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2"><R.icon size={13} /></span>
                        <span className="text-[11px] font-semibold">{R.label}</span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.label} className="border-b border-border/60 last:border-0 hover:bg-surface-2/50">
                  <td className="py-2.5 pl-5 pr-3">{p.label}</td>
                  {(["admin", "editor", "designer", "client"] as const).map((r) => (
                    <td key={r} className="px-3 py-2.5 text-center">
                      {p[r] ? <Check size={14} className="mx-auto text-success" /> : <X size={13} className="mx-auto text-border-strong" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity */}
      <div className="rounded-2xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-[14.5px] font-semibold">Atividade recente</h3>
          <p className="text-[12px] text-muted">Auditoria das ações do workspace</p>
        </div>
        <div className="divide-y divide-border/70 px-5">
          {(ws?.activity ?? []).slice(0, 10).map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-3">
              <Avatar name={a.actorName} color={a.actorColor} size={28} />
              <p className="flex-1 text-[13px]">
                <span className="font-semibold">{a.actorName.split(" ")[0]}</span> <span className="text-muted">{a.action}</span>
              </p>
              <span className="text-[11.5px] text-muted">{timeAgo(a.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onDone={() => { setInviteOpen(false); refetch(); }} />
    </div>
  );
}

function MemberRow({ member, isSelf, onAction }: { member: Member; isSelf: boolean; onAction: (b: Record<string, unknown>, msg: string) => void }) {
  const R = ROLE_META[member.role];
  type DItem = { label: string; icon?: React.ReactNode; onClick?: () => void; danger?: boolean; divider?: boolean };
  const menuItems: DItem[] = isSelf ? [] : [
    ...(Object.keys(ROLE_META) as (keyof typeof ROLE_META)[]).filter((r) => r !== member.role).map((r) => ({
      label: `Tornar ${ROLE_META[r].label}`,
      icon: (() => { const Icon = ROLE_META[r].icon; return <Icon size={13} />; })(),
      onClick: () => onAction({ action: "changeRole", id: member.id, role: r }, `${member.name} agora é ${ROLE_META[r].label}.`),
    })),
    { divider: true, label: "" },
    {
      label: member.status === "pending" ? "Cancelar convite" : "Remover do workspace",
      icon: <Trash2 size={13} />, danger: true,
      onClick: () => onAction({ action: "removeMember", id: member.id }, member.status === "pending" ? "Convite cancelado." : "Membro removido."),
    },
  ];
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      <Avatar name={member.name} color={member.avatarColor} size={38} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold">
          {member.name}
          {isSelf && <Badge tone="accent">você</Badge>}
          {member.status === "pending" && <Badge tone="warning">Convite pendente</Badge>}
        </p>
        <p className="truncate text-[12px] text-muted">{member.email}</p>
      </div>
      <Dropdown
        trigger={
          <button className="flex items-center gap-1.5 rounded-full transition hover:opacity-80">
            <Badge tone={R.tone}>{R.label} {!isSelf && <MoreHorizontal size={10} className="ml-0.5" />}</Badge>
          </button>
        }
        items={menuItems}
      />
    </div>
  );
}

function InviteModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", email, role }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(data.error || "Não foi possível convidar.");
    toast.success(`Convite enviado para ${email}.`);
    setEmail("");
    onDone();
  }

  return (
    <Modal open={open} onClose={onClose} title="Convidar membro" subtitle="A pessoa receberá um e-mail com o link de acesso">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div>
          <label className={labelCls}>E-mail *</label>
          <input type="email" required className={inputCls} placeholder="colega@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Função</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(ROLE_META) as (keyof typeof ROLE_META)[]).map((r) => {
              const R = ROLE_META[r];
              return (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={cn("rounded-xl border p-3 text-left transition", role === r ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong")}>
                  <span className="flex items-center gap-1.5 text-[12.5px] font-semibold"><R.icon size={13} className={role === r ? "text-accent" : "text-muted"} /> {R.label}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-muted">{R.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}><UserPlus size={14} /> Enviar convite</Button>
        </div>
      </form>
    </Modal>
  );
}
