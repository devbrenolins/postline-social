"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Users, Eye, Heart, Download, FileSpreadsheet, FileText, TrendingUp, TrendingDown, Percent, ImageIcon,
  Sparkles, UserSearch, MousePointerClick, Compass, LayoutGrid, MapPin, Timer,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, LineChart, Line, ReferenceLine, Cell, LabelList,
} from "recharts";
import { cn, Button, Segmented, PlatformChip, Badge, fmt, PLATFORM_META } from "@/components/ui";
import type { PlatformT } from "@/lib/types";
import { toast } from "sonner";

interface SeriesPoint { day: string; followers: number; reach: number; views: number; engagement: number; }
interface TopPost {
  id: string;
  caption: string;
  mediaUrl: string | null;
  permalink: string | null;
  publishedAt: string | null;
  platform: PlatformT;
  productType: string;
  metrics: { likes: number; comments: number; shares: number; saves: number; reach: number; views: number; avgWatchTime: number };
}
interface Cut { label: string; views: number; reach: number }
interface AudienceRow { label: string; followers: number; reached: number }
interface Analytics {
  series: SeriesPoint[];
  kpis: {
    followers: number; reach: number; views: number; engagement: number; engagementRate: number;
    followersDelta: number; followersGained: number; profileViews: number; websiteClicks: number; accountsEngaged: number;
    reachDelta: number; viewsDelta: number; engagementDelta: number; profileViewsDelta: number; websiteClicksDelta: number;
  };
  accounts: { id: string; platform: PlatformT; handle: string; followers: number }[];
  weekdayScores: { day: string; score: number }[];
  topPosts: TopPost[];
  breakdowns: { followType: Cut[]; format: Cut[] };
  audience: { city: AudienceRow[]; country: AudienceRow[]; age: AudienceRow[]; gender: AudienceRow[] };
}

/** Série categórica dos gráficos: ordem fixa, validada para daltonismo. */
const CAT = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];

const FORMAT_LABEL: Record<string, string> = {
  REEL: "Reels", STORY: "Stories", POST: "Posts", CAROUSEL_CONTAINER: "Carrosséis", AD: "Anúncios", IGTV: "IGTV",
};
/** Cor fixa por formato — um filtro que some com uma barra não repinta as outras. */
const FORMAT_ORDER = ["REEL", "STORY", "POST", "CAROUSEL_CONTAINER", "AD"];
const formatColor = (label: string) => CAT[FORMAT_ORDER.indexOf(label) === -1 ? 4 : FORMAT_ORDER.indexOf(label)];

const GENDER_LABEL: Record<string, string> = { F: "Feminino", M: "Masculino", U: "Não informado" };
const FOLLOW_COLOR: Record<string, string> = { NON_FOLLOWER: CAT[1], FOLLOWER: CAT[0], UNKNOWN: "var(--border-strong)" };
const FOLLOW_LABEL: Record<string, string> = { FOLLOWER: "Seguidores", NON_FOLLOWER: "Não seguidores", UNKNOWN: "Não identificado" };

/** Retenção vem em milissegundos. */
const watchTime = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}min ${Math.round((ms % 60_000) / 1000)}s` : `${(ms / 1000).toFixed(1).replace(".", ",")}s`);

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
    const header = ["Data", "Seguidores", "Alcance", "Visualizações", "Engajamento"];
    const rows = data.series.map((s) => [s.day, s.followers, s.reach, s.views, s.engagement]);
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
    { label: "Seguidores", value: k ? fmt(k.followers) : "…", delta: k?.followersDelta, icon: Users, sub: k ? `${k.followersGained >= 0 ? "+" : ""}${fmt(k.followersGained)} no período` : undefined },
    { label: "Alcance", value: k ? fmt(k.reach) : "…", delta: k?.reachDelta, icon: Eye },
    { label: "Visualizações", value: k ? fmt(k.views) : "…", delta: k?.viewsDelta, icon: ImageIcon },
    { label: "Engajamento", value: k ? fmt(k.engagement) : "…", delta: k?.engagementDelta, icon: Heart },
    { label: "Taxa de engaj.", value: k ? `${k.engagementRate.toFixed(1).replace(".", ",")}%` : "…", delta: k?.engagementDelta, icon: Percent },
    { label: "Contas engajadas", value: k ? fmt(k.accountsEngaged) : "…", icon: Sparkles },
    { label: "Visitas ao perfil", value: k ? fmt(k.profileViews) : "…", delta: k?.profileViewsDelta, icon: UserSearch },
    { label: "Cliques no site", value: k ? fmt(k.websiteClicks) : "…", delta: k?.websiteClicksDelta, icon: MousePointerClick },
  ];

  const followType = data?.breakdowns?.followType ?? [];
  const discovery = followType.find((f) => f.label === "NON_FOLLOWER");
  const totalFollowViews = followType.reduce((sum, f) => sum + f.views, 0);
  const discoveryShare = totalFollowViews > 0 ? ((discovery?.views ?? 0) / totalFollowViews) * 100 : 0;
  const formatCuts = data?.breakdowns?.format ?? [];
  const paid = formatCuts.find((f) => f.label === "AD");

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
        <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 sm:ml-auto sm:w-auto">
          <Segmented value={days} onChange={setDays} options={[{ value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "75", label: "75d" }]} />
          <Button variant="outline" size="sm" onClick={() => exportCSV(",")}><Download size={13} /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV(";")}><FileSpreadsheet size={13} /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => { toast.success("Gerando PDF… use a caixa de impressão para salvar."); setTimeout(() => window.print(), 400); }}><FileText size={13} /> PDF</Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
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
              {card.sub && <p className="mt-1 text-[10.5px] text-muted tnum">{card.sub}</p>}
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

        {/* Visualizações */}
        <ChartCard title="Visualizações" sub="Total de visualizações do conteúdo publicado por dia">
          {data ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3F7D5D" stopOpacity={0.25} /><stop offset="100%" stopColor="#3F7D5D" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v as number)} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="views" name="Visualizações" stroke="#3F7D5D" strokeWidth={2} fill="url(#gViews)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="skeleton h-full" />}
        </ChartCard>
      </div>

      {/* Descoberta + formato */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Compass size={14} /></span>
            <div>
              <h3 className="text-[14px] font-semibold">Descoberta</h3>
              <p className="text-[12px] text-muted">Quanto do conteúdo chegou a quem ainda não segue o perfil</p>
            </div>
          </div>

          {data ? (
            totalFollowViews > 0 ? (
              <>
                <p className="mt-4 text-[32px] font-semibold leading-none tracking-tight tnum">
                  {discoveryShare.toFixed(0)}<span className="text-[20px] text-muted">%</span>
                </p>
                <p className="mt-1 text-[12px] text-muted">das visualizações vieram de não seguidores</p>
                <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full">
                  {followType.map((f) => (
                    <div key={f.label} className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{ width: `${(f.views / totalFollowViews) * 100}%`, background: FOLLOW_COLOR[f.label] ?? "var(--border-strong)" }} />
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {followType.map((f) => (
                    <div key={f.label} className="flex items-center gap-2 text-[12px]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: FOLLOW_COLOR[f.label] ?? "var(--border-strong)" }} />
                      <span className="text-muted">{FOLLOW_LABEL[f.label] ?? f.label}</span>
                      <span className="ml-auto font-semibold tnum">{fmt(f.views)}</span>
                      <span className="w-20 text-right text-muted tnum">{fmt(f.reach)} alcance</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-6 text-[12.5px] text-muted">Sem dados de descoberta no período.</p>
            )
          ) : (
            <div className="mt-4 space-y-2"><div className="skeleton h-10" /><div className="skeleton h-3" /><div className="skeleton h-16" /></div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><LayoutGrid size={14} /></span>
            <div>
              <h3 className="text-[14px] font-semibold">Por formato</h3>
              <p className="text-[12px] text-muted">
                Visualizações por tipo de publicação
                {paid ? <> — {fmt(paid.views)} vieram de anúncios</> : null}
              </p>
            </div>
          </div>
          <div className="mt-3 h-53">
            {data ? (
              formatCuts.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={formatCuts} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v as number)} />
                    <YAxis type="category" dataKey="label" width={78} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => FORMAT_LABEL[v as string] ?? (v as string)} />
                    <Tooltip content={<CutTip />} cursor={{ fill: "var(--surface-2)" }} />
                    <Bar dataKey="views" name="Visualizações" radius={[2, 4, 4, 2]} maxBarSize={22}>
                      {formatCuts.map((f) => <Cell key={f.label} fill={formatColor(f.label)} />)}
                      <LabelList dataKey="views" position="right" formatter={(v) => fmt(Number(v ?? 0))}
                        style={{ fill: "var(--muted)", fontSize: 11, fontVariantNumeric: "tabular-nums" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[12.5px] text-muted">Sem publicações no período.</p>
              )
            ) : <div className="skeleton h-full" />}
          </div>
        </div>
      </div>

      {/* Audiência */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="text-[14px] font-semibold">Faixa etária</h3>
          <p className="mb-3 text-[12px] text-muted">Seguidores por idade</p>
          <div className="h-44">
            {data ? (
              data.audience.age.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.audience.age} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<AudienceTip />} cursor={{ fill: "var(--surface-2)" }} />
                    <Bar dataKey="followers" name="Seguidores" radius={[4, 4, 2, 2]} fill="var(--accent)" maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-[12.5px] text-muted">A Meta só libera demografia com audiência suficiente.</p>
            ) : <div className="skeleton h-full" />}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="text-[14px] font-semibold">Gênero</h3>
          <p className="mb-3 text-[12px] text-muted">Seguidores declarados</p>
          <BarRows rows={(data?.audience.gender ?? []).map((g) => ({ label: GENDER_LABEL[g.label] ?? g.label, value: g.followers }))} loading={!data} />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-1.5">
            <MapPin size={13} className="text-muted" />
            <h3 className="text-[14px] font-semibold">Onde estão</h3>
          </div>
          <p className="mb-3 text-[12px] text-muted">Principais cidades dos seguidores</p>
          <BarRows rows={(data?.audience.city ?? []).slice(0, 6).map((c) => ({ label: c.label.replace(/,.*/, ""), value: c.followers }))} loading={!data} />
        </div>
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
            <p className="text-[12px] text-muted">Publicações reais do perfil, ordenadas por alcance</p>
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
                  <th className="px-3 py-2.5 text-right font-semibold">Visualiz.</th>
                  <th className="py-2.5 pl-3 pr-5 text-right font-semibold">Alcance</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topPosts ?? Array.from({ length: 5 })).map((p, i) =>
                  p ? (
                    <tr key={p.id} className="border-b border-border/60 transition last:border-0 hover:bg-surface-2/50">
                      <td className="py-2.5 pl-5 pr-3">
                        <a
                          href={p.permalink ?? undefined}
                          target={p.permalink ? "_blank" : undefined}
                          rel="noreferrer"
                          className={cn("flex items-center gap-2.5", p.permalink && "hover:text-accent")}
                        >
                          {p.mediaUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.mediaUrl} alt="" className="h-9 w-9 rounded-lg object-cover" loading="lazy" />
                          ) : <span className="h-9 w-9 rounded-lg bg-surface-2" />}
                          <span className="min-w-0">
                            <span className="block max-w-60 truncate font-medium">{p.caption || "Sem legenda"}</span>
                            {p.metrics.avgWatchTime > 0 && (
                              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted tnum">
                                <Timer size={10} /> {watchTime(p.metrics.avgWatchTime)} assistidos em média
                              </span>
                            )}
                          </span>
                        </a>
                      </td>
                      <td className="px-3 py-2.5"><PlatformChip platform={p.platform} size={12} /></td>
                      <td className="px-3 py-2.5 text-right font-semibold tnum">{fmt(p.metrics.likes)}</td>
                      <td className="px-3 py-2.5 text-right tnum">{fmt(p.metrics.comments)}</td>
                      <td className="px-3 py-2.5 text-right tnum">{fmt(p.metrics.saves)}</td>
                      <td className="px-3 py-2.5 text-right tnum">{fmt(p.metrics.views)}</td>
                      <td className="py-2.5 pl-3 pr-5 text-right">
                        <Badge tone="accent">{fmt(p.metrics.reach)}</Badge>
                      </td>
                    </tr>
                  ) : (
                    <tr key={i}><td colSpan={7} className="px-5 py-2.5"><div className="skeleton h-9 w-full" /></td></tr>
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

/** Ranking simples: rótulo, barra e valor — para dimensões sem eixo próprio. */
function BarRows({ rows, loading }: { rows: { label: string; value: number }[]; loading?: boolean }) {
  if (loading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-7" />)}</div>;
  if (rows.length === 0) return <p className="text-[12.5px] text-muted">A Meta só libera demografia com audiência suficiente.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-[12px] text-muted" title={r.label}>{r.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="w-10 text-right text-[12px] font-semibold tnum">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

function CutTip({ active, payload }: { active?: boolean; payload?: { payload: Cut }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="mb-1 text-[11px] font-medium text-muted">{FORMAT_LABEL[row.label] ?? row.label}</p>
      <p className="text-[12px] font-semibold tnum">{fmt(row.views)} visualizações</p>
      <p className="text-[12px] text-muted tnum">{fmt(row.reach)} de alcance</p>
    </div>
  );
}

function AudienceTip({ active, payload }: { active?: boolean; payload?: { payload: AudienceRow }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="mb-1 text-[11px] font-medium text-muted">{row.label}</p>
      <p className="text-[12px] font-semibold tnum">{fmt(row.followers)} seguidores</p>
      {row.reached > 0 && <p className="text-[12px] text-muted tnum">{fmt(row.reached)} alcançados</p>}
    </div>
  );
}
