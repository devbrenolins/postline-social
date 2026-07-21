import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { db } from "@/db";
import { users, workspaces, workspaceMembers } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { cache } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Cookie que guarda o workspace ativo (para troca de workspace). */
export const WORKSPACE_COOKIE = "postline_ws";

const AVATAR_PALETTE = ["#AB2F5F", "#3E6C8E", "#3F7D5D", "#6B5B95", "#8A6D3B"];
function randomColor() {
  return AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)];
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/* ------------------------------------------------------------------ */
/*  Provisionamento: cria/vincula o perfil local ao usuário Supabase   */
/* ------------------------------------------------------------------ */

async function provisionProfile(authUser: SupabaseUser) {
  const email = (authUser.email ?? "").toLowerCase().trim();
  const meta = (authUser.user_metadata ?? {}) as Record<string, string | undefined>;
  const name =
    meta.full_name?.trim() ||
    meta.name?.trim() ||
    (email ? email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Novo usuário");
  const avatarUrl = meta.avatar_url || meta.picture || null;

  // 1) Já existe perfil vinculado a este authId?
  let profile = (await db.select().from(users).where(eq(users.authId, authUser.id)).limit(1))[0];

  if (!profile) {
    // 2) Existe conta legada com o mesmo e-mail (sem authId)? Vincula.
    const legacy = email ? (await db.select().from(users).where(eq(users.email, email)).limit(1))[0] : undefined;
    if (legacy && !legacy.authId) {
      profile = (
        await db
          .update(users)
          .set({ authId: authUser.id, avatarUrl: legacy.avatarUrl ?? avatarUrl, updatedAt: new Date() })
          .where(eq(users.id, legacy.id))
          .returning()
      )[0];
    } else {
      // 3) Cria novo perfil.
      const inserted = await db
        .insert(users)
        .values({ authId: authUser.id, email, name, avatarColor: randomColor(), avatarUrl })
        .onConflictDoNothing({ target: users.authId })
        .returning();
      profile = inserted[0] ?? (await db.select().from(users).where(eq(users.authId, authUser.id)).limit(1))[0];
    }
  }
  if (!profile) throw new Error("Não foi possível provisionar o perfil.");

  // 4) Anexa convites pendentes endereçados a este e-mail.
  if (email) {
    await db
      .update(workspaceMembers)
      .set({ userId: profile.id, status: "active", updatedAt: new Date() })
      .where(and(eq(workspaceMembers.invitedEmail, email), isNull(workspaceMembers.userId), isNull(workspaceMembers.deletedAt)));
  }

  // 5) Garante ao menos um workspace.
  const membership = (
    await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, profile.id), isNull(workspaceMembers.deletedAt)))
      .limit(1)
  )[0];
  if (!membership) {
    const wsName = meta.workspace_name?.trim() || `Workspace de ${name.split(" ")[0]}`;
    const slug = `${slugify(wsName) || "workspace"}-${profile.id.slice(0, 6)}`;
    const [ws] = await db
      .insert(workspaces)
      .values({ name: wsName, slug, color: profile.avatarColor, ownerId: profile.id })
      .returning();
    await db.insert(workspaceMembers).values({
      workspaceId: ws.id,
      userId: profile.id,
      role: "admin",
      status: "active",
      avatarColor: profile.avatarColor,
    });
  }

  return profile;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  avatarUrl: string | null;
  settings: Record<string, unknown>;
  workspaceId: string;
  authId: string;
};

/** Cached por requisição: usuário autenticado (Supabase) + workspace ativo, ou null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  let authUser: SupabaseUser | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    authUser = data.user;
  } catch {
    return null; // Supabase ainda não configurado.
  }
  if (!authUser) return null;

  const profile = await provisionProfile(authUser);

  const memberships = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, profile.id),
        eq(workspaceMembers.status, "active"),
        isNull(workspaceMembers.deletedAt)
      )
    );

  let workspaceId = memberships[0]?.workspaceId ?? "";
  const store = await cookies();
  const preferred = store.get(WORKSPACE_COOKIE)?.value;
  if (preferred && memberships.some((m) => m.workspaceId === preferred)) {
    workspaceId = preferred;
  }

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    avatarColor: profile.avatarColor,
    avatarUrl: profile.avatarUrl ?? null,
    settings: (profile.settings as Record<string, unknown>) ?? {},
    workspaceId,
    authId: authUser.id,
  };
});

/* ------------------------------------------------------------------ */
/*  Helpers legados (ainda usados: chaves de API, hashing utilitário)  */
/* ------------------------------------------------------------------ */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const reference = Buffer.from(hash, "hex");
  return candidate.length === reference.length && timingSafeEqual(candidate, reference);
}

export function generateToken(bytes = 48): string {
  return randomBytes(bytes).toString("hex");
}

/** Rate limiter em memória para endpoints sensíveis. */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  if (bucket.count > limit) return false;
  return true;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
