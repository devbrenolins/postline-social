"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Users, Eye, Heart, MousePointerClick, Download, FileSpreadsheet, FileText, TrendingUp, TrendingDown, Percent, ImageIcon,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, LineChart, Line, ReferenceLine,
} from "recharts";
import { cn, Button, Segmented, PlatformChip, Badge, fmt, PLATFORM_META } from "@/components/ui";
import type { Post, PlatformT } from "@/lib/types";
import { toast } from "sonner";

interface SeriesPoint { day: string; followers: number; reach: number; impressions: number; engagement: number; clicks: number; }
interface Analytics {
  series: SeriesPoint[];
  kpis: { followers: number; reach: number; impressions: number; engagement: number; clicks: number; ctr: number; engagementRate: number; followersDelta: number; reachDelta: number; impressionsDelta: number; engagementDelta: number; clicksDelta: number };
  byPlatform: { platform: string; reach: number; engagement: number }[];
  accounts: { id: string; platform: PlatformT; handle: string; followers: number }[];
  heatmap: number[][];
  weekdayScores: { day: string; score: number }[];
  topPosts: Post[];
}

const dayLabel = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export default function AnalyticsPage() {
  const [days, setDays] = useState("30");
  const [platform, setPlatform] = useState<PlatformT | "all">("all");
  const [data, setData] = useState<Analytics | null>(null);

  const load = useCallback(async () => {
    setData(null);
    const res = await fetch(`/api/analytics?days=${days}&platform=${platform}`);
    if (res.ok) setData(await res.json());
  }, [days, platform]);

  useEffect(() => { load(); }, [load]);

  function exportCSV(sep = ",") {
    if (!data) return;
    const header = ["Data", "Seguidores", "Alcance", "Impressões", "Engajamento", "Cliques"];
    const rows = data.series.map((s) => [s.day, s.followers, s.reach, s.impressions, s.engagement, s.clicks]);
    const csv = [header, ...rows].map((r) => r.join(sep)).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `postline-analytics-${days}d.csv`;
    a.click();
    toast.success("Arquivo CSV exportado.");
  }

  const k = data?.kpis;
  const kpis = [
    { label: "Seguidores", value: k ? fmt(k.followers) : "…", delta: k?.followersDelta, icon: Users },
    { label: "Alcance", value: k ? fmt(k.reach) : "…", delta: k?.reachDelta, icon: Eye },
    { label: "Impressões", value: k ? fmt(k.impressions) : "…", delta: k?.impressionsDelta, icon: ImageIcon },
    { label: "Engajamento", value: k ? fmt(k.engagement) : "…", delta: k?.engagementDelta, icon: Heart },
    { label: "Cliques", value: k ? fmt(k.clicks) : "…", delta: k?.clicksDelta, icon: MousePointerClick },
    { label: "Taxa de engaj.", value: k ? `${k.engagementRate.toFixed(1).replace(".", ",")}%` : "…", delta: k?.engagementDelta, icon: Percent },
  ];

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Controls */}
      <div className="no-print flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setPlatform("all")} className={cn("rounded-full border px-3 py-1.5 text-[12px] font-medium transition", platform === "all" ? "border-foreground bg-foreground text-background" : "border-border text-muted hover:text-foreground")}>Todas</button>
          {(Object.keys(PLATFORM_META) as PlatformT[]).map((p) => (
            <button key={p} onClick={() => setPlatform(p)}
              className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                platform === p ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground")}>
              <PlatformChip platform={p} size={10} /> {PLATFORM_META[p].name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Segmented value={days} onChange={setDays} options={[{ value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "75", label: "75d" }]} />
          <Button variant="outline" size="sm" onClick={() => exportCSV(",")}><Download size={13} /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV(";")}><FileSpreadsheet size={13} /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => { toast.success("Gerando PDF… use a caixa de impressão para salvar."); setTimeout(() => window.print(), 400); }}><FileText size={13} /> PDF</Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((card) => {
          const positive = (card.delta ?? 0) >= 0;
          return (
            <div key={card.label} className="rounded-2xl border border-border bg-surface p-4">
              <span className="flex h-7.5 w-7.5 items-center justify-center rounded-lg bg-accent-soft text-accent"><card.icon size={14} /></span>
              <p className="mt-2.5 text-[19px] font-semibold leading-none tracking-tight tnum">{card.value}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <p className="text-[11.5px] text-muted">{card.label}</p>
                {card.delta !== undefined && (
                  <span className={cn("flex items-center gap-0.5 text-[10.5px] font-semibold tnum", positive ? "text-success" : "text-danger")}>
                    {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{positive ? "+" : ""}{card.delta.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Engagement */}
        <ChartCard title="Engajamento diário" sub="Curtidas, comentários, compartilhamentos e salvamentos">
          {data ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gEng" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v as number)} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="engagement" name="Engajamento" stroke="var(--accent)" strokeWidth={2} fill="url(#gEng)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="skeleton h-full" />}
        </ChartCard>

        {/* Followers */}
        <ChartCard title="Evolução de seguidores" sub="Total acumulado das contas filtradas">
          {data ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis domain={["dataMin - 100", "dataMax + 100"]} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v as number)} />
                <Tooltip content={<Tip />} />
                <Line type="monotone" dataKey="followers" name="Seguidores" stroke="#4F83AC" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="skeleton h-full" />}
        </ChartCard>

        {/* Weekday bars */}
        <ChartCard title="Melhores dias" sub="Pontuação média de engajamento por dia da semana">
          {data ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weekdayScores} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                <YAxis hide domain={[0, 110]} />
                <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-2)" }} />
                <ReferenceLine y={75} stroke="var(--border-strong)" strokeDasharray="4 3" />
                <Bar dataKey="score" name="Pontuação" radius={[6, 6, 2, 2]} fill="var(--accent)" maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="skeleton h-full" />}
        </ChartCard>

        {/* Clicks & CTR */}
        <ChartCard title="Cliques no link" sub="Tráfego gerado a partir das publicações">
          {data ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gClk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3F7D5D" stopOpacity={0.25} /><stop offset="100%" stopColor="#3F7D5D" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v as number)} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="clicks" name="Cliques" stroke="#3F7D5D" strokeWidth={2} fill="url(#gClk)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="skeleton h-full" />}
        </ChartCard>
      </div>

      {/* Accounts + top posts table */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="text-[14px] font-semibold">Contas conectadas</h3>
          <p className="text-[12px] text-muted">Seguidores por perfil</p>
          <div className="mt-4 space-y-3">
            {(data?.accounts ?? []).map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <PlatformChip platform={a.platform} size={13} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">@{a.handle}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (a.followers / (Math.max(...(data?.accounts.map((x) => x.followers) ?? [1]))) * 100))}%`, background: PLATFORM_META[a.platform].color }} />
                  </div>
                </div>
                <span className="text-[12px] font-semibold tnum">{fmt(a.followers)}</span>
              </div>
            ))}
            {!data && Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-9" />)}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-[14px] font-semibold">Top publicações do período</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2.5 pl-5 pr-3 font-semibold">Publicação</th>
                  <th className="px-3 py-2.5 font-semibold">Rede</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Curtidas</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Coment.</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Salvos</th>
                  <th className="py-2.5 pl-3 pr-5 text-right font-semibold">Alcance</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topPosts ?? Array.from({ length: 5 })).map((p, i) =>
                  p ? (
                    <tr key={p.id} className="border-b border-border/60 transition last:border-0 hover:bg-surface-2/50">
                      <td className="py-2.5 pl-5 pr-3">
                        <div className="flex items-center gap-2.5">
                          {p.mediaUrls[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.mediaUrls[0]} alt="" className="h-9 w-9 rounded-lg object-cover" loading="lazy" />
                          ) : <span className="h-9 w-9 rounded-lg bg-surface-2" />}
                          <span className="max-w-60 truncate font-medium">{p.caption}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><PlatformChip platform={p.networks[0]} size={12} /></td>
                      <td className="px-3 py-2.5 text-right font-semibold tnum">{fmt(p.metrics.likes)}</td>
                      <td className="px-3 py-2.5 text-right tnum">{fmt(p.metrics.comments)}</td>
                      <td className="px-3 py-2.5 text-right tnum">{fmt(p.metrics.saves)}</td>
                      <td className="py-2.5 pl-3 pr-5 text-right">
                        <Badge tone="accent">{fmt(p.metrics.reach)}</Badge>
                      </td>
                    </tr>
                  ) : (
                    <tr key={i}><td colSpan={6} className="px-5 py-2.5"><div className="skeleton h-9 w-full" /></td></tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="text-[14px] font-semibold">{title}</h3>
      <p className="mb-3 text-[12px] text-muted">{sub}</p>
      <div className="h-60">{children}</div>
    </div>
  );
}

function Tip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-lg">
      {label && <p className="mb-1 text-[11px] font-medium text-muted">{dayLabel(label)}</p>}
      {payload.map((p) => (
        <p key={p.name} className="text-[12px] font-semibold tnum" style={{ color: p.color ?? "var(--accent)" }}>
          {p.name}: {fmt(Number(p.value))}
        </p>
      ))}
    </div>
  );
}
