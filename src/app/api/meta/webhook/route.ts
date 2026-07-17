import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { directAutomations } from "@/db/schema";
import { sendInstagramDirect, verifyMetaSignature } from "@/lib/meta";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) return new Response(challenge ?? "", { status: 200 });
  return NextResponse.json({ error: "Verificação inválida." }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  const workspaceId = process.env.META_WORKSPACE_ID;
  if (!workspaceId) return NextResponse.json({ error: "META_WORKSPACE_ID não configurado." }, { status: 503 });
  const payload = JSON.parse(raw);
  const events = (payload.entry ?? []).flatMap((entry: { messaging?: unknown[] }) => entry.messaging ?? []) as Array<{ sender?: { id?: string }; message?: { text?: string; is_echo?: boolean } }>;
  const rules = await db.select().from(directAutomations).where(and(eq(directAutomations.workspaceId, workspaceId), eq(directAutomations.active, true), isNull(directAutomations.deletedAt)));

  for (const event of events) {
    const senderId = event.sender?.id;
    const text = event.message?.text?.toLowerCase().trim();
    if (!senderId || !text || event.message?.is_echo) continue;
    const rule = rules.find((item) => item.triggerKeywords.some((keyword) => text.includes(keyword.toLowerCase())));
    if (!rule) continue;
    await sendInstagramDirect(senderId, rule.responseTemplate);
    await db.update(directAutomations).set({ sentCount: sql`${directAutomations.sentCount} + 1`, lastSentAt: new Date(), updatedAt: new Date() }).where(eq(directAutomations.id, rule.id));
  }
  return NextResponse.json({ received: true });
}
