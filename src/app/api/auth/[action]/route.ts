import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, workspaceMembers, workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, destroySession, getSessionUser, hashPassword, rateLimit, verifyPassword } from "@/lib/auth";
import { headers } from "next/headers";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;

  try {
    if (action === "login") {
      const hdrs = await headers();
      const ip = hdrs.get("x-forwarded-for") ?? "local";
      if (!rateLimit(`login:${ip}`, 12)) return jsonError("Muitas tentativas. Aguarde um minuto.", 429);

      const { email, password } = await req.json();
      if (!email || !password) return jsonError("Informe e-mail e senha.");
      const found = await db.select().from(users).where(eq(users.email, String(email).toLowerCase().trim())).limit(1);
      const user = found[0];
      if (!user || !verifyPassword(String(password), user.passwordHash)) {
        return jsonError("E-mail ou senha incorretos.", 401);
      }
      await createSession(user.id);
      return NextResponse.json({ ok: true, name: user.name });
    }

    if (action === "register") {
      const hdrs = await headers();
      const ip = hdrs.get("x-forwarded-for") ?? "local";
      if (!rateLimit(`register:${ip}`, 8)) return jsonError("Muitas tentativas. Aguarde um minuto.", 429);

      const { name, email, password, workspace } = await req.json();
      if (!name || !email || !password) return jsonError("Preencha todos os campos.");
      if (String(password).length < 8) return jsonError("A senha deve ter pelo menos 8 caracteres.");
      const normalizedEmail = String(email).toLowerCase().trim();
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (existing[0]) return jsonError("Este e-mail já está em uso.", 409);

      const palette = ["#AB2F5F", "#3E6C8E", "#3F7D5D", "#6B5B95", "#8A6D3B"];
      const color = palette[Math.floor(Math.random() * palette.length)];
      const [user] = await db.insert(users).values({
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(String(password)),
        avatarColor: color,
      }).returning();

      const wsName = workspace?.trim() || `Workspace de ${user.name.split(" ")[0]}`;
      const slug = `${wsName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${user.id.slice(0, 6)}`;
      const [ws] = await db.insert(workspaces).values({ name: wsName, slug, color, ownerId: user.id }).returning();
      await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: user.id, role: "admin", avatarColor: color });

      await createSession(user.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "logout") {
      await destroySession();
      return NextResponse.json({ ok: true });
    }

    if (action === "forgot") {
      // Em produção: disparar e-mail via provedor transacional (Resend, SES…)
      return NextResponse.json({ ok: true });
    }

    return jsonError("Ação inválida.", 404);
  } catch (e) {
    console.error(`auth/${action}`, e);
    return jsonError("Erro interno. Tente novamente.", 500);
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== "me") return jsonError("Ação inválida.", 404);
  const user = await getSessionUser();
  if (!user) return jsonError("Não autenticado.", 401);
  return NextResponse.json({ user });
}
