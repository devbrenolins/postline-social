"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, CalendarDays, Images, Inbox, BarChart3, Briefcase, Users, Settings,
  Plus, Search, Bell, Sun, Moon, Menu, ChevronDown, LogOut, CheckCheck, Sparkles,
  UserRound, MonitorSmartphone, CornerDownLeft, Command as CommandIcon,
  BrainCircuit,
} from "lucide-react";
import { cn, Logo, Avatar, Dropdown, Button, timeAgo } from "@/components/ui";
import { WorkspaceProvider, useWorkspace } from "@/components/workspace-context";
import { ComposerProvider, useComposer, ComposerModal } from "@/components/composer";
import { toast } from "sonner";

const NAV = [
  { section: "Visão geral" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "Conteúdo" },
  { href: "/calendar", label: "Calendário", icon: CalendarDays, badge: "scheduled" as const },
  { href: "/media", label: "Biblioteca", icon: Images },
  { href: "/inbox", label: "Caixa de Entrada", icon: Inbox, badge: "inboxUnread" as const },
  { section: "Inteligência" },
  { href: "/studio", label: "IA & Automação", icon: BrainCircuit },
  { section: "Análise" },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { section: "Gestão" },
  { href: "/clients", label: "Clientes", icon: Briefcase },
  { href: "/team", label: "Equipe", icon: Users },
];

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/calendar": "Calendário",
  "/media": "Biblioteca de Mídia",
  "/inbox": "Caixa de Entrada",
  "/studio": "IA & Automação",
  "/analytics": "Analytics",
  "/clients": "Clientes",
  "/team": "Equipe",
  "/settings": "Configurações",
};

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <ComposerProvider>
        <ShellInner>{children}</ShellInner>
        <ComposerModal />
      </ComposerProvider>
    </WorkspaceProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="min-h-dvh lg:pl-62">
      <Sidebar open={drawer} onClose={() => setDrawer(false)} />
      <div className="flex min-h-dvh flex-col">
        <Topbar onMenu={() => setDrawer(true)} />
        <main className="flex-1 px-4 pb-16 pt-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-350">{children}</div>
        </main>
      </div>
      <Shortcuts />
    </div>
  );
}

/* --------------------------------- Sidebar --------------------------------- */
function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-y-0 left-0 z-40 hidden w-62 lg:block">
        <SidebarContent />
      </div>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 w-70 lg:hidden"
              initial={{ x: -290 }} animate={{ x: 0 }} exit={{ x: -290 }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
            >
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function SidebarContent() {
  const pathname = usePathname();
  const { data } = useWorkspace();
  const { open: openComposer } = useComposer();

  return (
    <aside className="flex h-full flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <Dropdown
          align="left"
          trigger={
            <button className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-surface-2" aria-label="Alternar workspace">
              <Logo size={28} />
              <span className="text-left">
                <span className="block max-w-30 truncate text-[13.5px] font-semibold leading-tight">{data?.workspace.name ?? "…"}</span>
                <span className="block text-[11px] font-medium capitalize leading-tight text-muted">Plano {data?.workspace.plan ?? ""}</span>
              </span>
              <ChevronDown size={14} className="text-muted" />
            </button>
          }
          items={[
            { label: "Configurações do workspace", icon: <Settings size={14} />, onClick: () => (window.location.href = "/settings") },
            { label: "Membros e permissões", icon: <Users size={14} />, onClick: () => (window.location.href = "/team") },
            { divider: true, label: "" },
            { label: "Criar novo workspace", icon: <Plus size={14} />, onClick: () => toast.info("Múltiplos workspaces disponíveis no plano Business.") },
          ]}
        />
      </div>

      <div className="px-3 pb-2 pt-2">
        <Button className="w-full" onClick={() => openComposer()}>
          <Plus size={16} /> Nova publicação
          <kbd className="ml-auto rounded-md bg-white/20 px-1.5 py-0.5 text-[10.5px] font-semibold">C</kbd>
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Navegação principal">
        {NAV.map((item, i) =>
          "section" in item ? (
            <p key={i} className="px-2.5 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-widest text-muted/70 first:pt-1">{item.section}</p>
          ) : (
            <NavItem key={item.href} {...item} active={pathname === item.href || pathname.startsWith(item.href + "/")} />
          )
        )}
      </nav>

      <div className="border-t border-border px-3 py-2.5">
        <NavItem href="/settings" label="Configurações" icon={Settings} active={pathname === "/settings"} />
        <UserCard />
      </div>
    </aside>
  );
}

function NavItem({ href, label, icon: Icon, active, badge }: {
  href: string; label: string; icon: React.ElementType; active: boolean; badge?: "scheduled" | "inboxUnread";
}) {
  const { data } = useWorkspace();
  const count = badge && data ? data.counts[badge] : 0;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-colors duration-150",
        active ? "bg-accent-soft text-accent" : "text-foreground/80 hover:bg-surface-2 hover:text-foreground"
      )}
    >
      {active && <motion.span layoutId="nav-pill" className="absolute left-0 top-1/2 h-4.5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />}
      <Icon size={17} strokeWidth={active ? 2.2 : 1.8} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {!!count && (
        <span className={cn("rounded-full px-1.5 py-px text-[10.5px] font-semibold tnum", active ? "bg-accent text-white" : "bg-surface-2 text-muted")}>
          {count}
        </span>
      )}
    </Link>
  );
}

function UserCard() {
  const { data } = useWorkspace();
  const router = useRouter();
  if (!data) return <div className="skeleton mt-1 h-12 w-full" />;
  return (
    <Dropdown
      align="left"
      trigger={
        <button className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-surface-2">
          <Avatar name={data.user.name} color={data.user.avatarColor} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight">{data.user.name}</span>
            <span className="block truncate text-[11px] text-muted">{data.user.email}</span>
          </span>
        </button>
      }
      items={[
        { label: "Meu perfil", icon: <UserRound size={14} />, onClick: () => router.push("/settings") },
        { label: "Configurações", icon: <Settings size={14} />, onClick: () => router.push("/settings") },
        { divider: true, label: "" },
        {
          label: "Sair", icon: <LogOut size={14} />, danger: true,
          onClick: async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); },
        },
      ]}
    />
  );
}

/* ---------------------------------- Topbar ---------------------------------- */
function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { data, refetch } = useWorkspace();
  const [palette, setPalette] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const unread = data?.notifications.filter((n) => !n.read) ?? [];

  return (
    <header data-topbar className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-350 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button onClick={onMenu} className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground lg:hidden" aria-label="Abrir menu">
          <Menu size={18} />
        </button>

        <h1 className="text-[15px] font-semibold tracking-tight">{TITLES[pathname] ?? "Postline"}</h1>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setPalette(true)}
            className="hidden items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-[12.5px] text-muted transition hover:border-border-strong hover:text-foreground sm:flex"
            aria-label="Busca rápida"
          >
            <Search size={14} />
            <span className="w-28 text-left">Busca rápida…</span>
            <span className="flex items-center gap-0.5 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10.5px]"><CommandIcon size={9} />K</span>
          </button>
          <button onClick={() => setPalette(true)} className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground sm:hidden" aria-label="Buscar">
            <Search size={17} />
          </button>

          <Dropdown
            trigger={
              <button className="relative rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground" aria-label="Notificações">
                <Bell size={17} />
                {unread.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-background" />}
              </button>
            }
            items={[]}
            // custom content via key trick is not supported; use dedicated popover below
          />
          <Notifications unread={unread.length} onReadAll={async () => {
            await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "readNotifications" }) });
            refetch();
          }} />

          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground"
            aria-label="Alternar tema"
            title={`Tema: ${theme}`}
          >
            {mounted && resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </header>
  );
}

function Notifications({ unread, onReadAll }: { unread: number; onReadAll: () => void }) {
  const { data } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const icons = { info: <Bell size={13} className="text-info" />, success: <CheckCheck size={13} className="text-success" />, warning: <Sparkles size={13} className="text-warning" /> };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="relative rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground" aria-label={`Notificações (${unread} não lidas)`}>
        <Bell size={17} />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-background" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} transition={{ duration: 0.13 }}
            className="absolute right-0 z-40 mt-1.5 w-88 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-[13px] font-semibold">Notificações</p>
              <button onClick={() => { onReadAll(); }} className="text-[12px] font-medium text-accent hover:underline">Marcar todas como lidas</button>
            </div>
            <div className="max-h-96 overflow-y-auto p-1.5">
              {(data?.notifications ?? []).slice(0, 10).map((n) => (
                <div key={n.id} className={cn("flex gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-surface-2", !n.read && "bg-accent-soft/50")}>
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2">{icons[n.kind]}</span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold leading-tight">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted/70">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ Command palette ------------------------------ */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { data } = useWorkspace();
  const { open: openComposer } = useComposer();
  const { setTheme } = useTheme();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const pages = NAV.flatMap((n) => ("href" in n && n.href && n.label ? [{ label: n.label, href: n.href }] : []));
    const base = [
      ...pages.map((n) => ({
        label: n.label, hint: "Ir para", icon: <CornerDownLeft size={13} />, run: () => router.push(n.href),
      })),
      { label: "Configurações", hint: "Ir para", icon: <CornerDownLeft size={13} />, run: () => router.push("/settings") },
      { label: "Nova publicação", hint: "Ação", icon: <Plus size={13} />, run: () => openComposer() },
      { label: "Alternar tema", hint: "Ação", icon: <MonitorSmartphone size={13} />, run: () => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark") },
      ...(data?.clients ?? []).map((c) => ({ label: `Cliente: ${c.name}`, hint: "Gestão", icon: <Briefcase size={13} />, run: () => router.push("/clients") })),
    ];
    if (!q.trim()) return base;
    const s = q.toLowerCase();
    return base.filter((i) => i.label.toLowerCase().includes(s));
  }, [q, data, router, openComposer, setTheme]);

  useEffect(() => {
    if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 40); }
  }, [open]);

  useEffect(() => setActive(0), [q]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && items[active]) { e.preventDefault(); items[active].run(); onClose(); }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[14vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            initial={{ scale: 0.97, y: -8, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.97, y: -8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" role="dialog" aria-label="Busca rápida"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search size={16} className="text-muted" />
              <input
                ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
                placeholder="Buscar páginas, ações, clientes…"
                className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted/70"
              />
              <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {items.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted">Nenhum resultado para “{q}”.</p>}
              {items.map((item, i) => (
                <button
                  key={item.label + i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { item.run(); onClose(); }}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px]", active === i ? "bg-accent-soft text-accent" : "text-foreground")}
                >
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", active === i ? "bg-accent/15" : "bg-surface-2 text-muted")}>{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[11px] text-muted">{item.hint}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------- Shortcuts -------------------------------- */
function Shortcuts() {
  const { open: openComposer } = useComposer();
  const router = useRouter();
  useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout>;
    const fn = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "c") { e.preventDefault(); openComposer(); }
      if (e.key === "g") { gPending = true; clearTimeout(gTimer); gTimer = setTimeout(() => (gPending = false), 800); return; }
      if (gPending) {
        gPending = false;
        const map: Record<string, string> = { d: "/dashboard", c: "/calendar", m: "/media", i: "/inbox", s: "/studio", a: "/analytics", u: "/clients", t: "/team" };
        if (map[e.key]) router.push(map[e.key]);
      }
    };
    window.addEventListener("keydown", fn);
    return () => { window.removeEventListener("keydown", fn); clearTimeout(gTimer); };
  }, [openComposer, router]);
  return null;
}
