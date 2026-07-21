"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  User, Building2, Bell, Palette, Plug, KeyRound, ShieldCheck, Copy, Check, Plus, Trash2,
  Sun, Moon, MonitorSmartphone, Globe,
} from "lucide-react";
import { cn, Button, Badge, Switch, Avatar, inputCls, labelCls, PlatformChip, InlineError, timeAgo } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { toast } from "sonner";
import { PLATFORM_META, type Platform } from "@/components/ui";

const TABS = [
  { id: "profile", label: "Perfil", icon: User },
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "appearance", label: "Aparência", icon: Palette },
  { id: "notifications", label: "Notificações", icon: Bell },
  { id: "integrations", label: "Integrações", icon: Plug },
  { id: "api", label: "API & Webhooks", icon: KeyRound },
  { id: "security", label: "Segurança", icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("profile");
  return (
    <div className="grid grid-cols-1 gap-6 animate-fade-up lg:grid-cols-[210px_1fr]">
      <div className="flex gap-1 overflow-x-auto lg:sticky lg:top-19 lg:block lg:self-start">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition lg:w-full",
              tab === t.id ? "bg-accent-soft text-accent" : "text-foreground/80 hover:bg-surface-2"
            )}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      <div className="min-w-0 max-w-160">
        {tab === "profile" && <ProfileTab />}
        {tab === "workspace" && <WorkspaceTab />}
        {tab === "appearance" && <AppearanceTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "integrations" && <IntegrationsTab />}
        {tab === "api" && <ApiTab />}
        {tab === "security" && <SecurityTab />}
      </div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {sub && <p className="text-[12px] text-muted">{sub}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/* --------------------------------- Profile --------------------------------- */
function ProfileTab() {
  const { data: ws, refetch } = useWorkspace();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#AB2F5F");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ws) { setName(ws.user.name); setColor(ws.user.avatarColor); } }, [ws]);

  async function save() {
    setBusy(true);
    await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updateProfile", name, avatarColor: color }) });
    await refetch();
    setBusy(false);
    toast.success("Perfil atualizado.");
  }

  return (
    <>
      <Card title="Informações pessoais" sub="Como você aparece para sua equipe">
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={name || "?"} color={color} size={56} />
          <div>
            <p className="text-[12.5px] font-medium">Cor do avatar</p>
            <div className="mt-1.5 flex gap-1.5">
              {["#AB2F5F", "#3E6C8E", "#3F7D5D", "#6B5B95", "#8A6D3B", "#C2410C"].map((c) => (
                <button key={c} onClick={() => setColor(c)} aria-label={`Cor ${c}`}
                  className={cn("h-6 w-6 rounded-full transition-transform hover:scale-110", color === c && "ring-2 ring-foreground ring-offset-2 ring-offset-surface")}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Nome completo</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>E-mail</label>
            <input className={cn(inputCls, "opacity-60")} value={ws?.user.email ?? ""} disabled />
            <p className="mt-1.5 text-[11.5px] text-muted">O e-mail de acesso não pode ser alterado nesta versão.</p>
          </div>
          <Button onClick={save} loading={busy}><Check size={14} /> Salvar alterações</Button>
        </div>
      </Card>
    </>
  );
}

/* -------------------------------- Workspace -------------------------------- */
function WorkspaceTab() {
  const { data: ws, refetch } = useWorkspace();
  const [name, setName] = useState("");
  useEffect(() => { if (ws) setName(ws.workspace.name); }, [ws]);

  return (
    <>
      <Card title="Workspace" sub="Identidade da organização">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Nome do workspace</label>
            <div className="flex gap-2">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="outline" onClick={async () => {
                await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updateWorkspace", name }) });
                refetch(); toast.success("Workspace renomeado.");
              }}><Check size={14} /></Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-surface-2/70 px-4 py-3">
            <div>
              <p className="text-[13px] font-medium">Plano atual</p>
              <p className="text-[11.5px] text-muted">Até 10 contas sociais, 3 membros</p>
            </div>
            <Badge tone="accent" className="px-3 py-1 text-[12px]">{ws?.workspace.plan === "pro" ? "Pro" : ws?.workspace.plan}</Badge>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <Globe size={13} /> Fuso horário: America/São_Paulo (GMT-3)
          </div>
        </div>
      </Card>
      <Card title="Zona de perigo" sub="Ações irreversíveis">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium">Excluir workspace</p>
            <p className="text-[11.5px] text-muted">Remove todos os posts, mídias e dados analíticos.</p>
          </div>
          <Button variant="danger" size="sm" onClick={() => toast.error("A exclusão requer confirmação por e-mail. Contate o suporte.")}>
            <Trash2 size={13} /> Excluir
          </Button>
        </div>
      </Card>
    </>
  );
}

/* -------------------------------- Appearance -------------------------------- */
function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const options = [
    { v: "light", l: "Claro", icon: Sun, desc: "Fundo claro, ideal para o dia" },
    { v: "dark", l: "Escuro", icon: Moon, desc: "Contraste suave para a noite" },
    { v: "system", l: "Automático", icon: MonitorSmartphone, desc: "Segue o sistema operacional" },
  ];
  return (
    <Card title="Tema da interface" sub="Aplicado instantaneamente em todos os dispositivos">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {options.map((o) => (
          <button key={o.v} onClick={() => setTheme(o.v)}
            className={cn(
              "rounded-2xl border-2 p-4 text-left transition",
              mounted && theme === o.v ? "border-accent bg-accent-soft/40" : "border-border hover:border-border-strong"
            )}>
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", mounted && theme === o.v ? "bg-accent text-white" : "bg-surface-2 text-muted")}>
              <o.icon size={16} />
            </span>
            <p className="mt-2.5 text-[13.5px] font-semibold">{o.l}</p>
            <p className="text-[11.5px] text-muted">{o.desc}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------- Notifications ------------------------------ */
function NotificationsTab() {
  type Prefs = { publish: boolean; inbox: boolean; weekly: boolean; alerts: boolean };
  const defaults: Prefs = { publish: true, inbox: true, weekly: true, alerts: true };
  const [prefs, setPrefs] = useState<Prefs>(() => {
    if (typeof window !== "undefined") {
      try { return { ...defaults, ...(JSON.parse(localStorage.getItem("postline.notif") ?? "{}") as Partial<Prefs>) }; } catch { return defaults; }
    }
    return defaults;
  });
  function set(key: keyof typeof prefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    localStorage.setItem("postline.notif", JSON.stringify(next));
    toast.success("Preferência salva.");
  }
  const rows: { key: keyof typeof prefs; title: string; desc: string }[] = [
    { key: "publish", title: "Publicações concluídas", desc: "Aviso quando um post agendado for publicado" },
    { key: "inbox", title: "Novas mensagens e comentários", desc: "Resumo em tempo quase real da caixa de entrada" },
    { key: "weekly", title: "Relatório semanal", desc: "Resumo de desempenho toda segunda-feira às 9h" },
    { key: "alerts", title: "Alertas de conexão", desc: "Aviso quando uma rede social precisar de reautenticação" },
  ];
  return (
    <Card title="Preferências de notificação" sub="Salvas automaticamente neste navegador">
      <div className="divide-y divide-border/70">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between py-3.5">
            <div>
              <p className="text-[13px] font-medium">{r.title}</p>
              <p className="text-[11.5px] text-muted">{r.desc}</p>
            </div>
            <Switch checked={prefs[r.key]} onChange={(v) => set(r.key, v)} label={r.title} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------- Integrations ------------------------------- */
function IntegrationsTab() {
  const { data: ws } = useWorkspace();
  const connected = new Set((ws?.accounts ?? []).map((a) => a.platform));
  return (
    <Card title="Redes sociais" sub="Conecte perfis para publicar e coletar métricas">
      <div className="space-y-2.5">
        {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
          const isConn = connected.has(p);
          const acc = ws?.accounts.find((a) => a.platform === p);
          const isInstagram = p === "instagram";
          return (
            <div key={p} className="flex items-center gap-3.5 rounded-xl border border-border px-4 py-3">
              <PlatformChip platform={p} size={16} />
              <div className="flex-1">
                <p className="text-[13.5px] font-medium">{PLATFORM_META[p].name}</p>
                <p className="text-[11.5px] text-muted">{isConn ? `@${acc?.handle} conectado` : isInstagram ? "Conecte via Instagram Business" : "Nenhuma conta conectada"}</p>
              </div>
              {isConn ? <Badge tone="success">Conectado</Badge> : <Badge>Inativo</Badge>}
              <Button
                variant={isConn ? "outline" : "soft"}
                size="sm"
                onClick={() => {
                  if (isInstagram) { window.location.href = "/api/meta/connect"; return; }
                  toast.info(isConn ? "Gerenciamento via painel do provedor." : `Integração do ${PLATFORM_META[p].name} em breve.`);
                }}
              >
                {isConn ? (isInstagram ? "Adicionar conta" : "Gerenciar") : "Conectar"}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ----------------------------------- API ----------------------------------- */
function ApiTab() {
  const { data: ws, refetch } = useWorkspace();
  const [newKey, setNewKey] = useState("");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);

  async function createKey() {
    const res = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createKey", name: name || "Nova chave" }) });
    const data = await res.json();
    if (res.ok) { setNewKey(data.key); setName(""); refetch(); }
  }

  return (
    <>
      <Card title="Chaves de API" sub="Autentique integrações externas com o header Authorization: Bearer">
        <div className="mb-4 flex gap-2">
          <input className={inputCls} placeholder="Nome da chave (ex.: Zapier)" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={createKey}><Plus size={14} /> Gerar</Button>
        </div>
        {newKey && (
          <div className="mb-4 rounded-xl border border-success/30 bg-success/8 p-3.5">
            <p className="text-[12px] font-medium text-success">Copie agora — a chave completa só aparece uma vez:</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-surface px-3 py-2 font-mono text-[11.5px]">{newKey}</code>
              <Button variant="outline" size="icon" aria-label="Copiar chave" onClick={() => { navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {(ws?.apiKeys ?? []).map((k) => (
            <div key={k.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
              <KeyRound size={15} className="text-muted" />
              <div className="flex-1">
                <p className="text-[13px] font-medium">{k.name}</p>
                <p className="font-mono text-[11px] text-muted">{k.masked}</p>
              </div>
              <span className="hidden text-[11px] text-muted sm:block">{k.lastUsedAt ? `Usada ${timeAgo(k.lastUsedAt)}` : "Nunca usada"}</span>
              {k.revokedAt ? <Badge tone="danger">Revogada</Badge> : (
                <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/10" onClick={async () => {
                  await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revokeKey", id: k.id }) });
                  refetch(); toast.success("Chave revogada.");
                }}>Revogar</Button>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card title="Webhooks" sub="Receba eventos em tempo real na sua infraestrutura">
        {(ws?.webhooks ?? []).map((h) => (
          <div key={h.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
            <span className={cn("h-2 w-2 rounded-full", h.active ? "bg-success" : "bg-muted")} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[12px]">{h.url}</p>
              <div className="mt-1 flex gap-1">{h.events.map((e) => <Badge key={String(e)}>{String(e)}</Badge>)}</div>
            </div>
            <Badge tone={h.active ? "success" : "neutral"}>{h.active ? "Ativo" : "Pausado"}</Badge>
          </div>
        ))}
        <Button variant="outline" size="sm" className="mt-3" onClick={() => toast.info("Criação de webhooks via API: POST /v1/webhooks")}>
          <Plus size={13} /> Novo webhook
        </Button>
      </Card>
    </>
  );
}

/* --------------------------------- Security -------------------------------- */
function SecurityTab() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [twoFA, setTwoFA] = useState(false);
  const { data: ws } = useWorkspace();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.next !== form.confirm) return setError("As senhas não coincidem.");
    setBusy(true);
    const res = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "changePassword", current: form.current, next: form.next }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error || "Não foi possível alterar.");
    toast.success("Senha alterada com sucesso.");
    setForm({ current: "", next: "", confirm: "" });
  }

  return (
    <>
      <Card title="Alterar senha">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelCls}>Senha atual</label>
            <input type="password" className={inputCls} value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nova senha</label>
              <input type="password" className={inputCls} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} minLength={8} required />
            </div>
            <div>
              <label className={labelCls}>Confirmar nova senha</label>
              <input type="password" className={inputCls} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
            </div>
          </div>
          {error && <InlineError>{error}</InlineError>}
          <Button type="submit" loading={busy}><Check size={14} /> Atualizar senha</Button>
        </form>
      </Card>
      <Card title="Autenticação em duas etapas (2FA)" sub="Camada extra de proteção para sua conta">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium">Aplicativo autenticador</p>
            <p className="text-[11.5px] text-muted">{twoFA ? "Proteção ativa — códigos via app" : "Configure um app como Google Authenticator"}</p>
          </div>
          <Switch checked={twoFA} onChange={(v) => { setTwoFA(v); toast.success(v ? "2FA ativado (demonstração)." : "2FA desativado."); }} label="2FA" />
        </div>
      </Card>
      <Card title="Sessões ativas">
        <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
          <MonitorSmartphone size={16} className="text-muted" />
          <div className="flex-1">
            <p className="text-[13px] font-medium">Esta sessão <Badge tone="success" className="ml-1.5">atual</Badge></p>
            <p className="text-[11.5px] text-muted">{ws?.user.email} · Cookie httpOnly · expira em 30 dias</p>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-muted">Sair de todos os dispositivos invalida as sessões anteriores.</p>
      </Card>
    </>
  );
}
