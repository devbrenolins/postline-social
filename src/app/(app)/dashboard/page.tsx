"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users, Eye, Heart, TrendingUp, TrendingDown, ArrowUpRight, CalendarClock,
  Bell, ChevronRight, Repeat2,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, LineChart, Line,
} from "recharts";
import { cn, Badge, Button, PlatformChip, Avatar, fmt, timeAgo, POST_STATUS } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { useComposer } from "@/components/composer";
import type { Post } from "@/lib/types";

interface SeriesPoint { day: string; followers: number; reach: number; views: number; engagement: number; }
interface Analytics {
  series: SeriesPoint[];
  kpis: { followers: number; reach: number; views: number; engagement: number; engagementRate: number; followersDelta: number; reachDelta: number; viewsDelta: number; engagementDelta: number };
  weekdayScores: { day: string; score: number }[];
  topPosts: Post[];
}

const dayLabel = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export default function DashboardPage() {
  const { data: ws } = useWorkspace();
  const { open: openComposer } = useComposer();
  const [range, setRange] = useState(30);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [upcoming, setUpcoming] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [a, p] = await Promise.all([
      fetch(`/api/analytics?days=${range}`).then((r) => r.json()),
      fetch("/api/posts?scope=scheduled&limit=5").then((r) => r.json()),
    ]);
    setAnalytics(a);
    setUpcoming(p.posts ?? []);
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const k = analytics?.kpis;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight">{greeting}, {ws?.user.name.split(" ")[0] ?? "…"}</h2>
          <p className="mt-0.5 capitalize text-[13px] text-muted">{today}</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
          {[7, 30, 75].map((d) => (
            <button key={d} onClick={() => { setRange(d); setLoading(true); }}
              className={cn("rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition", range === d ? "bg-foreground text-background" : "text-muted hover:text-foreground")}>
              {d === 75 ? "75 dias" : `${d} dias`}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Seguidores" value={k ? fmt(k.followers) : "…"} delta={k?.followersDelta} icon={<Users size={16} />} loading={!k} spark={analytics?.series.map((s) => s.followers) ?? []} sparkKey="followers" />
        <KpiCard label="Alcance" value={k ? fmt(k.reach) : "…"} delta={k?.reachDelta} icon={<Eye size={16} />} loading={!k} spark={analytics?.series.map((s) => s.reach) ?? []} sparkKey="reach" />
        <KpiCard label="Engajamento" value={k ? fmt(k.engagement) : "…"} delta={k?.engagementDelta} icon={<Heart size={16} />} loading={!k} spark={analytics?.series.map((s) => s.engagement) ?? []} sparkKey="engagement" sub={k ? `${k.engagementRate.toFixed(1).replace(".", ",")}% do alcance` : undefined} />
        <KpiCard label="Visualizações" value={k ? fmt(k.views) : "…"} delta={k?.viewsDelta} icon={<Repeat2 size={16} />} loading={!k} spark={analytics?.series.map((s) => s.views) ?? []} sparkKey="views" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Reach chart */}
        <div className="rounded-2xl border border-border bg-surface p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold">Alcance e visualizações</h3>
              <p className="text-[12px] text-muted">Todas as redes conectadas</p>
            </div>
            <div className="flex items-center gap-4 text-[11.5px] text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} /> Alcance</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "#8a8fa3" }} /> Visualizações</span>
            </div>
          </div>
          <div className="h-64">
            {loading || !analytics ? (
              <div className="skeleton h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.series} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gReach" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v as number)} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="views" name="Visualizações" stroke="#8a8fa3" strokeWidth={1.5} fill="transparent" strokeDasharray="4 3" />
                  <Area type="monotone" dataKey="reach" name="Alcance" stroke="var(--accent)" strokeWidth={2} fill="url(#gReach)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right column: upcoming + alerts */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">Próximas publicações</h3>
              <Link href="/calendar" className="flex items-center gap-0.5 text-[12px] font-medium text-accent hover:underline">
                Ver todas <ChevronRight size={13} />
              </Link>
            </div>
            <div className="space-y-1">
              {loading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14 w-full" />)}
              {!loading && upcoming.length === 0 && (
                <div className="rounded-xl border border-dashed border-border-strong py-6 text-center">
                  <CalendarClock size={18} className="mx-auto mb-2 text-muted" />
                  <p className="text-[12.5px] text-muted">Nada agendado nos próximos dias.</p>
                  <Button size="sm" variant="soft" className="mt-3" onClick={() => openComposer()}>Agendar agora</Button>
                </div>
              )}
              {!loading && upcoming.map((p) => (
                <Link key={p.id} href="/calendar" className="group flex items-center gap-3 rounded-xl px-1.5 py-1.5 transition hover:bg-surface-2">
                  {p.mediaUrls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.mediaUrls[0]} alt="" className="h-11 w-11 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-2 text-muted"><CalendarClock size={16} /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium">{p.caption || "Sem legenda"}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted tnum">
                      {p.scheduledAt && new Date(p.scheduledAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} · {p.scheduledAt && new Date(p.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex -space-x-1">
                    {p.networks.slice(0, 2).map((n) => <PlatformChip key={n} platform={n} size={12} />)}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="mb-3 flex items-center gap-2 text-[14px] font-semibold"><Bell size={15} className="text-accent" /> Alertas</h3>
            <div className="space-y-2.5">
              {(ws?.notifications ?? []).slice(0, 4).map((n) => (
                <div key={n.id} className="flex gap-2.5">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.kind === "warning" ? "bg-warning" : n.kind === "success" ? "bg-success" : "bg-info")} />
                  <div>
                    <p className="text-[12.5px] font-medium leading-tight">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted">{n.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Followers growth */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="text-[14px] font-semibold">Crescimento de seguidores</h3>
          <p className="text-[12px] text-muted">Acumulado no período</p>
          <div className="mt-3 h-36">
            {!analytics ? <div className="skeleton h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <XAxis dataKey="day" hide />
                  <YAxis domain={["dataMin - 200", "dataMax + 200"]} tick={{ fontSize: 10.5, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v as number)} width={52} />
                  <Tooltip content={<ChartTip />} />
                  <Line type="monotone" dataKey="followers" name="Seguidores" stroke="var(--accent)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Badge tone="success"><TrendingUp size={11} /> {k ? `+${k.followersDelta.toFixed(1).replace(".", ",")}%` : "…"}</Badge>
            <span className="text-[11.5px] text-muted">vs. período anterior</span>
          </div>
        </div>

        {/* Melhores dias (engajamento real por dia da semana) */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="text-[14px] font-semibold">Melhores dias</h3>
          <p className="text-[12px] text-muted">Engajamento médio por dia da semana</p>
          <div className="mt-3 h-36">
            {!analytics ? <div className="skeleton h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.weekdayScores} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10.5, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                  <YAxis hide domain={[0, 100]} />
                  <Bar dataKey="score" name="Engajamento" radius={[5, 5, 2, 2]} fill="var(--accent)" maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Top posts */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold">Publicações em destaque</h3>
            <p className="text-[12px] text-muted">Maior engajamento recente</p>
          </div>
          <Link href="/analytics" className="flex items-center gap-0.5 text-[12px] font-medium text-accent hover:underline">
            Analytics completo <ArrowUpRight size={13} />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {(analytics?.topPosts ?? Array.from({ length: 5 })).map((p, i) =>
            p ? (
              <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="group overflow-hidden rounded-xl border border-border bg-surface transition-shadow hover:shadow-md">
                <div className="relative aspect-square bg-surface-2">
                  {p.mediaUrls[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.mediaUrls[0]} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                  )}
                  <div className="absolute left-2 top-2"><PlatformChip platform={p.networks[0]} size={12} /></div>
                </div>
                <div className="p-3">
                  <p className="truncate text-[12px] text-muted">{p.caption}</p>
                  <div className="mt-2 flex items-center gap-3 text-[11.5px] font-medium tnum">
                    <span className="flex items-center gap-1"><Heart size={11} className="text-accent" /> {fmt(p.metrics?.likes ?? 0)}</span>
                    <span className="flex items-center gap-1 text-muted"><Eye size={11} /> {fmt(p.metrics?.reach ?? 0)}</span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div key={i} className="skeleton aspect-[3/4]" />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, delta, icon, sub, loading, spark, sparkKey }: {
  label: string; value: string; delta?: number; icon: React.ReactNode; sub?: string; loading?: boolean; spark: number[]; sparkKey?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
        {!loading && delta !== undefined && (
          <span className={cn("flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tnum", positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
            {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {positive ? "+" : ""}{delta.toFixed(1).replace(".", ",")}%
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-3 space-y-2"><div className="skeleton h-6 w-24" /><div className="skeleton h-3 w-16" /></div>
      ) : (
        <>
          <p className="mt-2.5 text-[22px] font-semibold leading-none tracking-tight tnum">{value}</p>
          <p className="mt-1 text-[12px] text-muted">{label}{sub ? <span className="text-muted/70"> · {sub}</span> : null}</p>
        </>
      )}
      {!loading && spark.length > 2 && (
        <div className="mt-2 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 1, right: 0, left: 0, bottom: 0 }}>
              <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.5} fill="var(--accent-soft)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {sparkKey && null}
    </div>
  );
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="mb-1 text-[11px] font-medium text-muted">{label ? dayLabel(label) : ""}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-[12px] font-semibold tnum" style={{ color: p.color }}>
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? "var(--accent)" }} />
          {p.name}: {fmt(Number(p.value))}
        </p>
      ))}
    </div>
  );
}
