import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { db } from "@/db";
import { users, workspaces, workspaceMembers } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { cache } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TRIAL_DAYS } from "@/lib/plans";

/** Fim do teste de um workspace recém-criado. */
function trialDeadline() {
  return new Date(Date.now() + TRIAL_DAYS * 86_400_000);
}

/**
 * Cookie que guarda o workspace ativo.
 *
 * É só um atalho por dispositivo: a fonte de verdade é `users.settings.activeWorkspaceId`.
 * Antes a preferência vivia SÓ aqui, então entrar de outro aparelho caía num
 * workspace diferente — e, como cada workspace tem o próprio saldo, os créditos
 * pareciam contados por dispositivo.
 */
export const WORKSPACE_COOKIE = "postline_ws";

/** Chave dentro de `users.settings` onde a preferência acompanha a conta. */
export const ACTIVE_WORKSPACE_SETTING = "activeWorkspaceId";

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

/** Anexa convites pendentes endereçados a este e-mail. */
async function attachPendingInvites(profileId: string, email: string) {
  if (!email) return;
  await db
    .update(workspaceMembers)
    .set({ userId: profileId, status: "active", updatedAt: new Date() })
    .where(and(eq(workspaceMembers.invitedEmail, email), isNull(workspaceMembers.userId), isNull(workspaceMembers.deletedAt)));
}

/** Garante ao menos um workspace para o perfil (cria um de teste se não houver). */
async function ensureWorkspace(
  profile: { id: string; avatarColor: string },
  name: string,
  workspaceName?: string
) {
  const membership = (
    await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, profile.id), isNull(workspaceMembers.deletedAt)))
      .limit(1)
  )[0];
  if (membership) return;
  const wsName = workspaceName?.trim() || `Workspace de ${name.split(" ")[0]}`;
  const slug = `${slugify(wsName) || "workspace"}-${profile.id.slice(0, 6)}`;
  const [ws] = await db
    .insert(workspaces)
    .values({ name: wsName, slug, color: profile.avatarColor, ownerId: profile.id, plan: "trial", trialEndsAt: trialDeadline() })
    .returning();
  await db.insert(workspaceMembers).values({
    workspaceId: ws.id,
    userId: profile.id,
    role: "admin",
    status: "active",
    avatarColor: profile.avatarColor,
  });
}

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

  // Caminho rápido (quase toda requisição): perfil existente não precisa de mais
  // nada aqui. Convites e workspace são tratados em getSessionUser, em paralelo
  // com a leitura das associações.
  if (profile) return profile;

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

  await attachPendingInvites(profile.id, email);
  await ensureWorkspace(profile, name, meta.workspace_name);

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
    // `getClaims` valida o JWT localmente (sem ida ao Supabase) quando o projeto
    // usa chaves assimétricas; senão cai sozinho em `getUser`. O middleware já
    // renovou o token desta requisição.
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (claims?.sub) {
      authUser = {
        id: claims.sub,
        email: typeof claims.email === "string" ? claims.email : undefined,
        user_metadata: (claims.user_metadata as Record<string, unknown>) ?? {},
      } as SupabaseUser;
    }
  } catch {
    return null; // Supabase ainda não configurado.
  }
  if (!authUser) return null;

  const profile = await provisionProfile(authUser);
  const email = (authUser.email ?? "").toLowerCase().trim();

  // `createdAt` fixa a ordem: sem ORDER BY o Postgres pode devolver as linhas em
  // ordem diferente entre requisições, e o fallback abaixo cairia num workspace
  // distinto a cada acesso.
  const loadMemberships = () =>
    db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, profile.id),
          eq(workspaceMembers.status, "active"),
          isNull(workspaceMembers.deletedAt)
        )
      )
      .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.id));

  // Convites e associações em paralelo: no caso comum (nada novo) custa uma ida
  // ao banco em vez de duas. Um convite recém-anexado aparece já na próxima
  // navegação; se a pessoa não tem workspace nenhum, resolvemos em série abaixo.
  const [, firstRead] = await Promise.all([attachPendingInvites(profile.id, email).catch(() => {}), loadMemberships()]);
  let memberships = firstRead;
  if (memberships.length === 0) {
    await attachPendingInvites(profile.id, email);
    await ensureWorkspace(profile, profile.name);
    memberships = await loadMemberships();
  }

  const belongs = (id: string | undefined | null) => Boolean(id && memberships.some((m) => m.workspaceId === id));

  // Preferência da conta primeiro, cookie do dispositivo só como atalho.
  const settings = (profile.settings as Record<string, unknown>) ?? {};
  const saved = typeof settings[ACTIVE_WORKSPACE_SETTING] === "string" ? (settings[ACTIVE_WORKSPACE_SETTING] as string) : null;
  const store = await cookies();
  const cookieValue = store.get(WORKSPACE_COOKIE)?.value ?? null;

  let workspaceId = memberships[0]?.workspaceId ?? "";
  if (belongs(cookieValue)) workspaceId = cookieValue!;
  if (belongs(saved)) workspaceId = saved!;

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
