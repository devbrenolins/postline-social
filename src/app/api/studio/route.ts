import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { aiGenerations, competitors, directAutomations, media } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { AiConfigurationError, generateImage, generateText, type ReferenceImage } from "@/lib/openai";
import { metaConfigured, sendInstagramDirect } from "@/lib/meta";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno.";
  return NextResponse.json({ error: message }, { status: error instanceof AiConfigurationError ? 503 : 500 });
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const CREDIT_LIMITS = {
  script: { dailyCredits: 1, dailyGenerations: 20, reserveTokens: 2_500, label: "roteiros" },
  creative: { dailyCredits: 2, dailyGenerations: 8, reserveTokens: 15_000, label: "criativos" },
} as const;

function uploadedReferenceImages(value: unknown): ReferenceImage[] {
  if (!Array.isArray(value)) return [];
  const rows = value.slice(0, 3).map((item) => ({
    name: String(item?.name ?? "referencia"),
    type: String(item?.type ?? ""),
    dataUrl: String(item?.dataUrl ?? ""),
  })).filter((item) => /^data:image\/(png|jpeg|webp);base64,/.test(item.dataUrl));
  if (rows.reduce((total, item) => total + item.dataUrl.length, 0) > 5_500_000) throw new Error("Os anexos ultrapassam o limite total de 4 MB.");
  return rows;
}

async function resolveReferenceImages(value: unknown, workspaceId: string): Promise<ReferenceImage[]> {
  const uploaded = uploadedReferenceImages(value);
  const mediaIds = Array.isArray(value) ? value.slice(0, 3).map((item) => String(item?.mediaId ?? "")).filter(Boolean) : [];
  if (!mediaIds.length) return uploaded;
  const rows = await db.select({ id: media.id, name: media.name, url: media.url }).from(media).where(and(eq(media.workspaceId, workspaceId), inArray(media.id, mediaIds), isNull(media.deletedAt), isNull(media.trashedAt)));
  const libraryReferences = await Promise.all(rows.map(async (row) => {
    if (row.url.startsWith("data:image/")) return { name: row.name, type: row.url.slice(5, row.url.indexOf(";")), dataUrl: row.url };
    const url = new URL(row.url);
    if (url.protocol !== "https:" || url.hostname !== "images.pexels.com") throw new Error(`A imagem ${row.name} não pode ser usada como referência externa.`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Não foi possível carregar ${row.name} da biblioteca.`);
    const type = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw new Error(`Formato inválido na imagem ${row.name}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2_500_000) throw new Error(`A imagem ${row.name} ultrapassa 2,5 MB.`);
    return { name: row.name, type, dataUrl: `data:${type};base64,${bytes.toString("base64")}` };
  }));
  const result = [...uploaded, ...libraryReferences].slice(0, 3);
  if (result.reduce((total, item) => total + item.dataUrl.length, 0) > 9_000_000) throw new Error("As referências ultrapassam o limite total permitido.");
  return result;
}

async function dailyCredits(workspaceId: string) {
  const start = new Date(`${todayKey()}T00:00:00-03:00`);
  const rows = await db.select({ kind: aiGenerations.kind, inputTokens: aiGenerations.inputTokens, outputTokens: aiGenerations.outputTokens }).from(aiGenerations).where(and(eq(aiGenerations.workspaceId, workspaceId), inArray(aiGenerations.kind, ["script", "creative"]), gte(aiGenerations.createdAt, start)));
  const summarize = (kind: "script" | "creative") => {
    const matching = rows.filter((row) => row.kind === kind);
    const tokensUsed = matching.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0);
    const used = tokensUsed / 100_000;
    const limit = CREDIT_LIMITS[kind];
    return { used, remaining: Math.max(0, limit.dailyCredits - used), tokensUsed, generations: matching.length, ...limit };
  };
  return { script: summarize("script"), creative: summarize("creative") };
}

async function assertCreditAllowance(workspaceId: string, kind: "script" | "creative") {
  const credits = await dailyCredits(workspaceId);
  const bucket = credits[kind];
  if (bucket.generations >= bucket.dailyGenerations) throw new Error(`Limite diário de ${bucket.dailyGenerations} ${bucket.label} atingido. O saldo é renovado à meia-noite.`);
  if (bucket.remaining * 100_000 < bucket.reserveTokens) throw new Error(`Saldo diário insuficiente para gerar. Restam ${bucket.remaining.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} créditos Postline.`);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const wid = user.workspaceId;
  const dailyKind = `daily_trends:${todayKey()}`;
  const [automationRows, competitorRows, history, dailyRows, credits] = await Promise.all([
    db.select().from(directAutomations).where(and(eq(directAutomations.workspaceId, wid), isNull(directAutomations.deletedAt))).orderBy(desc(directAutomations.createdAt)),
    db.select().from(competitors).where(and(eq(competitors.workspaceId, wid), isNull(competitors.deletedAt))).orderBy(desc(competitors.createdAt)),
    db.select().from(aiGenerations).where(eq(aiGenerations.workspaceId, wid)).orderBy(desc(aiGenerations.createdAt)).limit(12),
    db.select().from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, dailyKind))).orderBy(desc(aiGenerations.createdAt)).limit(1),
    dailyCredits(wid),
  ]);
  return NextResponse.json({
    status: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      meta: metaConfigured(),
      textModel: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna",
      imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    },
    automations: automationRows,
    competitors: competitorRows,
    history,
    dailyTrend: dailyRows[0] ? { text: dailyRows[0].resultText, updatedAt: dailyRows[0].createdAt } : null,
    credits,
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const wid = user.workspaceId;
  const body = await req.json();

  try {
    if (body.action === "generateScript") {
      await assertCreditAllowance(wid, "script");
      const topic = String(body.topic ?? "").trim();
      if (!topic) return NextResponse.json({ error: "Informe o tema do roteiro." }, { status: 400 });
      const input = `Tema: ${topic}\nNicho: ${body.niche || "geral"}\nPlataforma: ${body.platform || "Instagram"}\nDuração: ${body.duration || "45 segundos"}\nTom: ${body.tone || "envolvente"}`;
      const references = await resolveReferenceImages(body.references, wid);
      const result = await generateText(
        "Você é um estrategista brasileiro de social media. Crie um roteiro pronto para gravação, em português do Brasil, com gancho, cenas numeradas, fala, texto na tela, indicação visual e CTA. Seja específico e não invente dados factuais.",
        `${input}${references.length ? "\nUse as imagens anexadas como referências comparativas e de direção. Explique claramente como elas influenciaram o resultado, sem copiar marcas ou identidade protegida." : ""}`,
        false,
        references
      );
      await db.insert(aiGenerations).values({ workspaceId: wid, userId: user.id, kind: "script", prompt: input, resultText: result.text, model: result.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens });
      return NextResponse.json(result);
    }

    if (body.action === "generateCreative") {
      await assertCreditAllowance(wid, "creative");
      const prompt = String(body.prompt ?? "").trim();
      if (!prompt) return NextResponse.json({ error: "Descreva o criativo." }, { status: 400 });
      const size = (["1024x1024", "1024x1536", "1536x1024"].includes(body.size) ? body.size : "1024x1024") as "1024x1024" | "1024x1536" | "1536x1024";
      const references = await resolveReferenceImages(body.references, wid);
      const enriched = `Crie um criativo profissional para redes sociais. ${prompt}. Identidade visual: ${body.style || "contemporânea, sofisticada e limpa"}. ${references.length ? "Use as imagens anexadas como influência visual e comparativa, preservando apenas os elementos solicitados e sem copiar marcas." : ""} Evite marcas d'água e textos ilegíveis.`;
      const result = await generateImage(enriched, size, references);
      await db.insert(aiGenerations).values({ workspaceId: wid, userId: user.id, kind: "creative", prompt: enriched, resultText: "Criativo gerado", model: result.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens });
      return NextResponse.json(result);
    }

    if (body.action === "dailyTrends") {
      const kind = `daily_trends:${todayKey()}`;
      const [cached] = await db.select().from(aiGenerations).where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, kind))).orderBy(desc(aiGenerations.createdAt)).limit(1);
      if (cached?.resultText) return NextResponse.json({ text: cached.resultText, model: cached.model, cached: true, updatedAt: cached.createdAt });
      const query = "Pesquise as tendências gerais de hoje no Brasil para redes sociais, sem limitar a um nicho. Cubra assuntos em alta, formatos, memes, comportamentos, áudios e oportunidades relevantes para Instagram, TikTok, YouTube e buscas. Entregue um resumo executivo, sinais observados, 8 oportunidades acionáveis e links de fontes atuais. Não invente popularidade nem métricas.";
      const result = await generateText("Você é um radar diário de tendências digitais. Use pesquisa na web, dê prioridade ao que é atual, informe a data, cite fontes e separe fatos de sugestões em português do Brasil.", query, true);
      const [saved] = await db.insert(aiGenerations).values({ workspaceId: wid, userId: user.id, kind, prompt: query, resultText: result.text, model: result.model }).returning();
      return NextResponse.json({ ...result, cached: false, updatedAt: saved.createdAt });
    }

    if (["trends", "music"].includes(body.action)) {
      const niche = String(body.niche ?? "").trim();
      if (!niche) return NextResponse.json({ error: "Informe o nicho." }, { status: 400 });
      const isMusic = body.action === "music";
      const query = isMusic
        ? `Pesquise músicas, áudios e formatos sonoros em alta agora para publicações do nicho ${niche}, com foco em ${body.platform || "Instagram e TikTok"}. Informe onde cada tendência foi observada, por que funciona e uma ideia de uso. Inclua links de fontes atuais quando disponíveis.`
        : `Pesquise assuntos, buscas, formatos e conversas em alta agora no nicho ${niche}, com foco em ${body.platform || "Instagram, TikTok e YouTube"}. Priorize sinais recentes, explique a oportunidade e sugira 7 ideias de conteúdo acionáveis. Inclua links de fontes atuais.`;
      const result = await generateText(
        "Você é um analista de tendências digitais. Use pesquisa na web, diferencie fatos verificados de sugestões e entregue uma análise objetiva em português do Brasil com data e fontes.",
        query,
        true
      );
      await db.insert(aiGenerations).values({ workspaceId: wid, userId: user.id, kind: body.action, prompt: query, resultText: result.text, model: result.model });
      return NextResponse.json(result);
    }

    if (body.action === "createCompetitor") {
      const name = String(body.name ?? "").trim();
      const handle = String(body.handle ?? "").trim().replace(/^@/, "");
      if (!name || !handle) return NextResponse.json({ error: "Informe nome e perfil." }, { status: 400 });
      const [row] = await db.insert(competitors).values({ workspaceId: wid, name, handle, platform: body.platform || "instagram" }).returning();
      return NextResponse.json({ competitor: row });
    }

    if (body.action === "deleteCompetitor") {
      await db.update(competitors).set({ deletedAt: new Date() }).where(and(eq(competitors.id, body.id), eq(competitors.workspaceId, wid)));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "analyzeCompetitors") {
      const rows = await db.select().from(competitors).where(and(eq(competitors.workspaceId, wid), eq(competitors.active, true), isNull(competitors.deletedAt)));
      if (!rows.length) return NextResponse.json({ error: "Adicione pelo menos um concorrente." }, { status: 400 });
      const profiles = rows.map((c) => `${c.name}: @${c.handle} no ${c.platform}`).join("\n");
      const result = await generateText(
        "Você é um analista competitivo de social media. Pesquise somente informações públicas atuais, cite fontes e não invente métricas. Entregue oportunidades, padrões de conteúdo, diferenciais e riscos em português do Brasil.",
        `Analise estes concorrentes:\n${profiles}\nCompare posicionamento, temas recentes, formatos, frequência visível, sinais de engajamento e lacunas que podem ser exploradas.`,
        true
      );
      const now = new Date();
      await Promise.all(rows.map((row) => db.update(competitors).set({ lastAnalysis: result.text, lastCheckedAt: now, updatedAt: now }).where(eq(competitors.id, row.id))));
      await db.insert(aiGenerations).values({ workspaceId: wid, userId: user.id, kind: "competitors", prompt: profiles, resultText: result.text, model: result.model });
      return NextResponse.json(result);
    }

    if (body.action === "createAutomation") {
      const keywords = String(body.keywords ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
      if (!body.name || !keywords.length || !body.response) return NextResponse.json({ error: "Preencha nome, gatilhos e resposta." }, { status: 400 });
      const [row] = await db.insert(directAutomations).values({
        workspaceId: wid,
        name: String(body.name).trim(),
        platform: "instagram",
        triggerKeywords: keywords,
        responseTemplate: String(body.response).trim(),
      }).returning();
      return NextResponse.json({ automation: row });
    }

    if (body.action === "toggleAutomation") {
      await db.update(directAutomations).set({ active: Boolean(body.active), updatedAt: new Date() }).where(and(eq(directAutomations.id, body.id), eq(directAutomations.workspaceId, wid)));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "deleteAutomation") {
      await db.update(directAutomations).set({ deletedAt: new Date() }).where(and(eq(directAutomations.id, body.id), eq(directAutomations.workspaceId, wid)));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "testDirect") {
      if (!body.recipientId || !body.message) return NextResponse.json({ error: "Informe o ID do destinatário e a mensagem." }, { status: 400 });
      const result = await sendInstagramDirect(String(body.recipientId), String(body.message));
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("studio", error);
    return errorResponse(error);
  }
}
