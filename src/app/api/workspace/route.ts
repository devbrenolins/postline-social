import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  workspaces, workspaceMembers, clients, socialAccounts, notifications,
  activityLogs, apiKeys, posts, inboxItems, users, webhooks,
} from "@/db/schema";
import { generateToken, getSessionUser, hashPassword } from "@/lib/auth";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const wid = user.workspaceId;

  const [wsRows, memberRows, clientRows, accountRows, notifRows, logRows, keyRows, counts, hookRows] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.id, wid)).limit(1),
    db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, wid), isNull(workspaceMembers.deletedAt))),
    db.select().from(clients).where(and(eq(clients.workspaceId, wid), isNull(clients.deletedAt))).orderBy(clients.name),
    db.select().from(socialAccounts).where(and(eq(socialAccounts.workspaceId, wid), isNull(socialAccounts.deletedAt))),
    db.select().from(notifications).where(and(eq(notifications.workspaceId, wid), isNull(notifications.deletedAt))).orderBy(desc(notifications.createdAt)).limit(15),
    db.select().from(activityLogs).where(and(eq(activityLogs.workspaceId, wid), isNull(activityLogs.deletedAt))).orderBy(desc(activityLogs.createdAt)).limit(20),
    db.select().from(apiKeys).where(and(eq(apiKeys.workspaceId, wid), isNull(apiKeys.deletedAt))).orderBy(desc(apiKeys.createdAt)),
    Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(posts).where(and(eq(posts.workspaceId, wid), eq(posts.status, "scheduled"), isNull(posts.deletedAt))),
      db.select({ count: sql<number>`count(*)` }).from(inboxItems).where(and(eq(inboxItems.workspaceId, wid), eq(inboxItems.status, "unread"), isNull(inboxItems.deletedAt))),
      db.select({ count: sql<number>`count(*)` }).from(posts).where(and(eq(posts.workspaceId, wid), eq(posts.status, "draft"), isNull(posts.deletedAt))),
    ]),
    db.select().from(webhooks).where(and(eq(webhooks.workspaceId, wid), isNull(webhooks.deletedAt))),
  ]);

  // Enrich members with user data when available
  const userIds = memberRows.filter((m) => m.userId).map((m) => m.userId!) as string[];
  const userRows = userIds.length
    ? await db.select({ id: users.id, name: users.name, email: users.email, avatarColor: users.avatarColor }).from(users).where(sql`${users.id} IN ${userIds}`)
    : [];
  const byId = new Map(userRows.map((u) => [u.id, u]));

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, avatarColor: user.avatarColor },
    workspace: wsRows[0],
    members: memberRows.map((m) => ({
      id: m.id, role: m.role, status: m.status,
      name: m.userId ? byId.get(m.userId)?.name ?? "—" : m.invitedEmail?.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      email: m.userId ? byId.get(m.userId)?.email : m.invitedEmail,
      avatarColor: m.userId ? byId.get(m.userId)?.avatarColor ?? m.avatarColor : m.avatarColor,
    })),
    clients: clientRows,
    accounts: accountRows,
    notifications: notifRows,
    activity: logRows,
    apiKeys: keyRows.map((k) => ({ ...k, key: undefined, masked: `${k.prefix}••••••••••••${k.id.slice(0, 4)}` })),
    webhooks: hookRows,
    counts: {
      scheduled: Number(counts[0][0]?.count ?? 0),
      inboxUnread: Number(counts[1][0]?.count ?? 0),
      drafts: Number(counts[2][0]?.count ?? 0),
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const wid = user.workspaceId;
  const body = await req.json();

  switch (body.action) {
    case "invite": {
      const email = String(body.email ?? "").toLowerCase().trim();
      if (!email.includes("@")) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
      const palette = ["#3E6C8E", "#6B5B95", "#3F7D5D", "#8A6D3B"];
      const [m] = await db.insert(workspaceMembers).values({
        workspaceId: wid, invitedEmail: email, role: body.role ?? "editor",
        status: "pending", avatarColor: palette[Math.floor(Math.random() * palette.length)],
      }).returning();
      await db.insert(activityLogs).values({
        workspaceId: wid, userId: user.id, actorName: user.name, actorColor: user.avatarColor,
        action: `convidou ${email} para a equipe`, entity: "team", entityId: m.id,
      });
      return NextResponse.json({ ok: true });
    }
    case "removeMember": {
      await db.update(workspaceMembers).set({ deletedAt: new Date() })
        .where(and(eq(workspaceMembers.id, body.id), eq(workspaceMembers.workspaceId, wid)));
      return NextResponse.json({ ok: true });
    }
    case "changeRole": {
      await db.update(workspaceMembers).set({ role: body.role, updatedAt: new Date() })
        .where(and(eq(workspaceMembers.id, body.id), eq(workspaceMembers.workspaceId, wid)));
      return NextResponse.json({ ok: true });
    }
    case "readNotifications": {
      await db.update(notifications).set({ read: true })
        .where(and(eq(notifications.workspaceId, wid), eq(notifications.read, false)));
      return NextResponse.json({ ok: true });
    }
    case "createKey": {
      const name = String(body.name ?? "").trim() || "Nova chave";
      const key = `pl_live_${generateToken(18)}`;
      await db.insert(apiKeys).values({ workspaceId: wid, name, prefix: "pl_live_", key });
      return NextResponse.json({ ok: true, key });
    }
    case "revokeKey": {
      await db.update(apiKeys).set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.id, body.id), eq(apiKeys.workspaceId, wid)));
      return NextResponse.json({ ok: true });
    }
    case "updateWorkspace": {
      await db.update(workspaces).set({ name: String(body.name ?? "").trim() || undefined, updatedAt: new Date() })
        .where(eq(workspaces.id, wid));
      return NextResponse.json({ ok: true });
    }
    case "updateProfile": {
      await db.update(users).set({
        name: String(body.name ?? "").trim() || undefined,
        avatarColor: body.avatarColor || undefined,
        updatedAt: new Date(),
      }).where(eq(users.id, user.id));
      return NextResponse.json({ ok: true });
    }
    case "changePassword": {
      if (!body.current || !body.next) return NextResponse.json({ error: "Preencha os campos." }, { status: 400 });
      if (String(body.next).length < 8) return NextResponse.json({ error: "A nova senha deve ter pelo menos 8 caracteres." }, { status: 400 });
      const { verifyPassword } = await import("@/lib/auth");
      const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      if (!verifyPassword(String(body.current), rows[0].passwordHash)) {
        return NextResponse.json({ error: "Senha atual incorreta." }, { status: 401 });
      }
      await db.update(users).set({ passwordHash: hashPassword(String(body.next)), updatedAt: new Date() }).where(eq(users.id, user.id));
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }
}
