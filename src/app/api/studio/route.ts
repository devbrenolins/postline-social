import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { aiGenerations, competitors, directAutomations } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { AiConfigurationError, generateImage, generateText } from "@/lib/openai";
import { metaConfigured, sendInstagramDirect } from "@/lib/meta";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno.";
  return NextResponse.json({ error: message }, { status: error instanceof AiConfigurationError ? 503 : 500 });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const wid = user.workspaceId;
  const [automationRows, competitorRows, history] = await Promise.all([
    db.select().from(directAutomations).where(and(eq(directAutomations.workspaceId, wid), isNull(directAutomations.deletedAt))).orderBy(desc(directAutomations.createdAt)),
    db.select().from(competitors).where(and(eq(competitors.workspaceId, wid), isNull(competitors.deletedAt))).orderBy(desc(competitors.createdAt)),
    db.select().from(aiGenerations).where(eq(aiGenerations.workspaceId, wid)).orderBy(desc(aiGenerations.createdAt)).limit(12),
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
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const wid = user.workspaceId;
  const body = await req.json();

  try {
    if (body.action === "generateScript") {
      const topic = String(body.topic ?? "").trim();
      if (!topic) return NextResponse.json({ error: "Informe o tema do roteiro." }, { status: 400 });
      const input = `Tema: ${topic}\nNicho: ${body.niche || "geral"}\nPlataforma: ${body.platform || "Instagram"}\nDuração: ${body.duration || "45 segundos"}\nTom: ${body.tone || "envolvente"}`;
      const result = await generateText(
        "Você é um estrategista brasileiro de social media. Crie um roteiro pronto para gravação, em português do Brasil, com gancho, cenas numeradas, fala, texto na tela, indicação visual e CTA. Seja específico e não invente dados factuais.",
        input
      );
      await db.insert(aiGenerations).values({ workspaceId: wid, userId: user.id, kind: "script", prompt: input, resultText: result.text, model: result.model });
      return NextResponse.json(result);
    }

    if (body.action === "generateCreative") {
      const prompt = String(body.prompt ?? "").trim();
      if (!prompt) return NextResponse.json({ error: "Descreva o criativo." }, { status: 400 });
      const size = (["1024x1024", "1024x1536", "1536x1024"].includes(body.size) ? body.size : "1024x1024") as "1024x1024" | "1024x1536" | "1536x1024";
      const enriched = `Crie um criativo profissional para redes sociais. ${prompt}. Identidade visual: ${body.style || "contemporânea, sofisticada e limpa"}. Evite marcas d'água e textos ilegíveis.`;
      const result = await generateImage(enriched, size);
      await db.insert(aiGenerations).values({ workspaceId: wid, userId: user.id, kind: "creative", prompt: enriched, resultText: "Criativo gerado", model: result.model });
      return NextResponse.json(result);
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
