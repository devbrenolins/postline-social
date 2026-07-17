import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clients, socialAccounts, activityLogs } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, eq, isNull } from "drizzle-orm";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const [clientRows, accountRows] = await Promise.all([
    db.select().from(clients).where(and(eq(clients.workspaceId, user.workspaceId), isNull(clients.deletedAt))).orderBy(clients.name),
    db.select().from(socialAccounts).where(and(eq(socialAccounts.workspaceId, user.workspaceId), isNull(socialAccounts.deletedAt))),
  ]);
  return NextResponse.json({
    clients: clientRows.map((c) => ({ ...c, accounts: accountRows.filter((a) => a.clientId === c.id) })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nome obrigatório." }, { status: 400 });
  const palette = ["#AB2F5F", "#3E6C8E", "#3F7D5D", "#6B5B95", "#8A6D3B", "#C2410C"];
  const [client] = await db.insert(clients).values({
    workspaceId: user.workspaceId,
    name,
    industry: String(body.industry ?? ""),
    responsible: String(body.responsible ?? ""),
    notes: String(body.notes ?? ""),
    color: body.color || palette[Math.floor(Math.random() * palette.length)],
  }).returning();
  await db.insert(activityLogs).values({
    workspaceId: user.workspaceId, userId: user.id, actorName: user.name, actorColor: user.avatarColor,
    action: `criou o cliente ${name}`, entity: "clients", entityId: client.id,
  });
  return NextResponse.json({ client }, { status: 201 });
}
