import { cookies, headers } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { db } from "@/db";
import { sessions, users, workspaceMembers } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cache } from "react";

export const SESSION_COOKIE = "postline_session";
const SESSION_DAYS = 30;

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

export async function createSession(userId: string) {
  const token = generateToken();
  const hdrs = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    token,
    userId,
    userAgent: hdrs.get("user-agent") ?? "",
    expiresAt,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token));
  }
  store.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  settings: Record<string, unknown>;
  workspaceId: string;
};

/** Cached per-request: returns the authenticated user + active workspace, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = token;

  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, tokenHash), gt(sessions.expiresAt, new Date()), isNull(users.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const membership = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, row.user.id), isNull(workspaceMembers.deletedAt)))
    .limit(1);

  return {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    avatarColor: row.user.avatarColor,
    settings: (row.user.settings as Record<string, unknown>) ?? {},
    workspaceId: membership[0]?.workspaceId ?? "",
  };
});

/** Simple in-memory rate limiter for sensitive endpoints (login, register). */
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
