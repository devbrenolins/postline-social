"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot, CheckCircle2, Download, ImageIcon, Loader2, MessageCircle, Music2,
  Plus, Radar, Sparkles, Trash2, TrendingUp, Video, WandSparkles,
} from "lucide-react";
import { Badge, Button, InlineError, Segmented, Switch, cn, inputCls, labelCls } from "@/components/ui";
import { toast } from "sonner";

type Tab = "script" | "creative" | "direct" | "intelligence";
type Automation = { id: string; name: string; triggerKeywords: string[]; responseTemplate: string; active: boolean; sentCount: number };
type Competitor = { id: string; name: string; handle: string; platform: string; lastCheckedAt: string | null };
type StudioData = {
  status: { openai: boolean; meta: boolean; textModel: string; imageModel: string };
  automations: Automation[];
  competitors: Competitor[];
};

async function callStudio(body: Record<string, unknown>) {
  const response = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
  return data;
}

export default function StudioPage() {
  const [tab, setTab] = useState<Tab>("script");
  const [data, setData] = useState<StudioData | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/studio", { cache: "no-store" });
    if (response.ok) setData(await response.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2"><Badge tone="accent"><Sparkles size={12} /> IA & Automação</Badge></div>
          <h2 className="text-2xl font-semibold tracking-tight">Central de crescimento</h2>
          <p className="mt-1 text-[13.5px] text-muted">Crie conteúdo, automatize conversas e encontre oportunidades em tempo real.</p>
        </div>
        <div className="flex gap-2">
          <StatusPill ok={data?.status.openai} label="OpenAI" />
          <StatusPill ok={data?.status.meta} label="Instagram" />
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "script", label: "Roteiros com IA" },
          { value: "creative", label: "Criativos com IA" },
          { value: "direct", label: "Automação de direct" },
          { value: "intelligence", label: "Radar de tendências" },
        ]} />
      </div>

      {tab === "script" && <ScriptGenerator configured={Boolean(data?.status.openai)} />}
      {tab === "creative" && <CreativeGenerator configured={Boolean(data?.status.openai)} />}
      {tab === "direct" && <DirectAutomation data={data} reload={load} />}
      {tab === "intelligence" && <Intelligence data={data} reload={load} />}
    </div>
  );
}

function StatusPill({ ok, label }: { ok?: boolean; label: string }) {
  return <div className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium", ok ? "border-success/25 bg-success/8 text-success" : "border-warning/25 bg-warning/8 text-warning")}>
    {ok ? <CheckCircle2 size={13} /> : <span className="h-2 w-2 rounded-full bg-current" />}{label}: {ok ? "conectado" : "configuração pendente"}
  </div>;
}

function ConnectionWarning({ provider }: { provider: "OpenAI" | "Meta" }) {
  return <InlineError>{provider === "OpenAI" ? "Adicione OPENAI_API_KEY nas variáveis da Vercel para usar este recurso." : "Conecte as credenciais da Meta e configure o webhook para enviar directs reais."}</InlineError>;
}

function ScriptGenerator({ configured }: { configured: boolean }) {
  const [form, setForm] = useState({ topic: "", niche: "", platform: "Instagram Reels", duration: "45 segundos", tone: "Dinâmico e educativo" });
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function generate() {
    setLoading(true); setError("");
    try { const data = await callStudio({ action: "generateScript", ...form }); setResult(data.text); toast.success("Roteiro criado."); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao gerar roteiro."); }
    finally { setLoading(false); }
  }
  return <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
    <Panel title="Briefing do roteiro" icon={<Video size={17} />}>
      {!configured && <ConnectionWarning provider="OpenAI" />}
      <Field label="Tema ou objetivo"><textarea className={cn(inputCls, "h-24 py-3 resize-none")} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Ex.: 3 erros que impedem sua pele de absorver o sérum" /></Field>
      <Field label="Nicho"><input className={inputCls} value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Ex.: skincare premium" /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Formato"><select className={inputCls} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}><option>Instagram Reels</option><option>TikTok</option><option>YouTube Shorts</option><option>Carrossel</option></select></Field><Field label="Duração"><select className={inputCls} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}><option>15 segundos</option><option>30 segundos</option><option>45 segundos</option><option>60 segundos</option></select></Field></div>
      <Field label="Tom"><input className={inputCls} value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} /></Field>
      {error && <InlineError>{error}</InlineError>}
      <Button className="w-full" onClick={generate} disabled={!configured || !form.topic.trim()} loading={loading}><WandSparkles size={16} /> Gerar roteiro completo</Button>
    </Panel>
    <ResultPanel title="Roteiro pronto" empty="Preencha o briefing para gerar cenas, falas, texto na tela e CTA." result={result} loading={loading} />
  </div>;
}

function CreativeGenerator({ configured }: { configured: boolean }) {
  const [prompt, setPrompt] = useState(""); const [style, setStyle] = useState("Editorial sofisticado, luz natural, cores da marca");
  const [size, setSize] = useState("1024x1024"); const [image, setImage] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function generate() { setLoading(true); setError(""); try { const data = await callStudio({ action: "generateCreative", prompt, style, size }); setImage(data.dataUrl); toast.success("Criativo gerado."); } catch (e) { setError(e instanceof Error ? e.message : "Erro ao gerar criativo."); } finally { setLoading(false); } }
  return <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
    <Panel title="Direção criativa" icon={<ImageIcon size={17} />}>
      {!configured && <ConnectionWarning provider="OpenAI" />}
      <Field label="O que você quer criar?"><textarea className={cn(inputCls, "h-28 py-3 resize-none")} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ex.: foto publicitária de um sérum botânico sobre pedra rosada, folhas ao redor..." /></Field>
      <Field label="Estilo visual"><input className={inputCls} value={style} onChange={(e) => setStyle(e.target.value)} /></Field>
      <Field label="Formato"><select className={inputCls} value={size} onChange={(e) => setSize(e.target.value)}><option value="1024x1024">Feed quadrado — 1:1</option><option value="1024x1536">Story / vertical — 2:3</option><option value="1536x1024">Paisagem — 3:2</option></select></Field>
      {error && <InlineError>{error}</InlineError>}
      <Button className="w-full" onClick={generate} disabled={!configured || !prompt.trim()} loading={loading}><Sparkles size={16} /> Gerar criativo</Button>
    </Panel>
    <Panel title="Prévia" icon={<WandSparkles size={17} />}>
      <div className="flex min-h-110 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong bg-surface-2/40">
        {loading ? <div className="text-center text-muted"><Loader2 className="mx-auto mb-3 animate-spin" /><p className="text-[13px]">Criando a imagem...</p></div> : image ? <img src={image} alt="Criativo gerado por IA" className="max-h-130 w-full object-contain" /> : <div className="max-w-xs text-center text-muted"><ImageIcon className="mx-auto mb-3 opacity-40" size={36} /><p className="text-[13px]">Seu criativo aparecerá aqui.</p></div>}
      </div>
      {image && <Button variant="outline" className="w-full" onClick={() => { const a = document.createElement("a"); a.href = image; a.download = `postline-criativo-${Date.now()}.png`; a.click(); }}><Download size={15} /> Baixar PNG</Button>}
    </Panel>
  </div>;
}

function DirectAutomation({ data, reload }: { data: StudioData | null; reload: () => void }) {
  const [form, setForm] = useState({ name: "", keywords: "", response: "" }); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function create() { setSaving(true); setError(""); try { await callStudio({ action: "createAutomation", ...form }); setForm({ name: "", keywords: "", response: "" }); await reload(); toast.success("Automação criada."); } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setSaving(false); } }
  async function mutate(body: Record<string, unknown>) { try { await callStudio(body); await reload(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro."); } }
  return <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
    <Panel title="Nova automação" icon={<Bot size={17} />}>
      {!data?.status.meta && <ConnectionWarning provider="Meta" />}
      <Field label="Nome da automação"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Enviar catálogo" /></Field>
      <Field label="Palavras-gatilho (separadas por vírgula)"><input className={inputCls} value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="catálogo, preço, quero comprar" /></Field>
      <Field label="Resposta automática"><textarea className={cn(inputCls, "h-28 py-3 resize-none")} value={form.response} onChange={(e) => setForm({ ...form, response: e.target.value })} placeholder="Olá! Que bom ter você aqui. Segue o nosso catálogo..." /></Field>
      {error && <InlineError>{error}</InlineError>}
      <Button className="w-full" onClick={create} loading={saving}><Plus size={16} /> Criar automação</Button>
      <p className="text-[11.5px] text-muted">As regras podem ser criadas antes da conexão. O envio só é ativado quando a Meta estiver conectada.</p>
    </Panel>
    <Panel title="Automações ativas" icon={<MessageCircle size={17} />}>
      {!data ? <Loading /> : data.automations.length === 0 ? <Empty icon={<Bot />} text="Nenhuma automação criada." /> : <div className="space-y-3">{data.automations.map((a) => <div key={a.id} className="rounded-2xl border border-border p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent"><MessageCircle size={17} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[13.5px]">{a.name}</p><Badge tone={a.active ? "success" : "neutral"}>{a.active ? "Ativa" : "Pausada"}</Badge></div><p className="mt-1 text-[12px] text-muted">Gatilhos: {a.triggerKeywords.join(", ")}</p><p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px]">{a.responseTemplate}</p><p className="mt-2 text-[11px] text-muted">{a.sentCount} respostas enviadas</p></div><Switch checked={a.active} onChange={(active) => mutate({ action: "toggleAutomation", id: a.id, active })} /><button onClick={() => mutate({ action: "deleteAutomation", id: a.id })} className="p-1.5 text-muted hover:text-danger" aria-label="Excluir"><Trash2 size={15} /></button></div></div>)}</div>}
    </Panel>
  </div>;
}

function Intelligence({ data, reload }: { data: StudioData | null; reload: () => void }) {
  const [mode, setMode] = useState<"trends" | "music" | "competitors">("trends"); const [niche, setNiche] = useState(""); const [platform, setPlatform] = useState("Instagram e TikTok"); const [result, setResult] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [competitor, setCompetitor] = useState({ name: "", handle: "", platform: "instagram" });
  async function research() { setLoading(true); setError(""); try { const payload = mode === "competitors" ? { action: "analyzeCompetitors" } : { action: mode, niche, platform }; const response = await callStudio(payload); setResult(response.text); toast.success("Pesquisa atualizada."); } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setLoading(false); } }
  async function addCompetitor() { try { await callStudio({ action: "createCompetitor", ...competitor }); setCompetitor({ name: "", handle: "", platform: "instagram" }); await reload(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro."); } }
  async function remove(id: string) { await callStudio({ action: "deleteCompetitor", id }); await reload(); }
  return <div className="space-y-5">
    <Segmented value={mode} onChange={(value) => { setMode(value); setResult(""); setError(""); }} options={[{ value: "trends", label: "Trend topics" }, { value: "music", label: "Músicas em alta" }, { value: "competitors", label: "Concorrentes" }]} />
    <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <Panel title={mode === "trends" ? "Radar de tendências" : mode === "music" ? "Radar de áudios" : "Monitoramento competitivo"} icon={mode === "trends" ? <TrendingUp size={17} /> : mode === "music" ? <Music2 size={17} /> : <Radar size={17} />}>
        {!data?.status.openai && <ConnectionWarning provider="OpenAI" />}
        {mode !== "competitors" ? <><Field label="Nicho"><input className={inputCls} value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Ex.: cafeterias especiais em Salvador" /></Field><Field label="Redes prioritárias"><input className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value)} /></Field></> : <><div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px]"><input className={inputCls} value={competitor.name} onChange={(e) => setCompetitor({ ...competitor, name: e.target.value })} placeholder="Nome" /><input className={inputCls} value={competitor.handle} onChange={(e) => setCompetitor({ ...competitor, handle: e.target.value })} placeholder="@perfil" /><select className={inputCls} value={competitor.platform} onChange={(e) => setCompetitor({ ...competitor, platform: e.target.value })}><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="youtube">YouTube</option></select></div><Button variant="outline" className="w-full" onClick={addCompetitor} disabled={!competitor.name || !competitor.handle}><Plus size={15} /> Adicionar concorrente</Button><div className="space-y-2">{(data?.competitors ?? []).map((c) => <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2"><Radar size={14} className="text-accent" /><span className="flex-1 text-[12.5px]"><b>{c.name}</b> · @{c.handle}</span><button onClick={() => remove(c.id)} className="text-muted hover:text-danger"><Trash2 size={14} /></button></div>)}</div></>}
        {error && <InlineError>{error}</InlineError>}
        <Button className="w-full" onClick={research} loading={loading} disabled={!data?.status.openai || (mode !== "competitors" ? !niche : !(data?.competitors.length))}><Radar size={16} /> Pesquisar agora</Button>
      </Panel>
      <ResultPanel title="Inteligência acionável" empty="A pesquisa usa fontes públicas atuais e entrega oportunidades prontas para o calendário." result={result} loading={loading} />
    </div>
  </div>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><div className="mb-5 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span><h3 className="text-[14px] font-semibold">{title}</h3></div><div className="space-y-4">{children}</div></section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className={labelCls}>{label}</span>{children}</label>; }
function Loading() { return <div className="flex justify-center py-12 text-muted"><Loader2 className="animate-spin" /></div>; }
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="flex flex-col items-center justify-center py-16 text-center text-muted"><span className="mb-3 opacity-40">{icon}</span><p className="text-[13px]">{text}</p></div>; }
function ResultPanel({ title, empty, result, loading }: { title: string; empty: string; result: string; loading: boolean }) { return <Panel title={title} icon={<Sparkles size={17} />}>{loading ? <div className="flex min-h-80 flex-col items-center justify-center text-muted"><Loader2 className="mb-3 animate-spin" /><p className="text-[13px]">Analisando e criando...</p></div> : result ? <div className="whitespace-pre-wrap rounded-xl bg-surface-2/60 p-4 text-[13px] leading-6">{result}</div> : <Empty icon={<Sparkles size={30} />} text={empty} />}</Panel>; }
