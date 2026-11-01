import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { inboxItems, socialAccounts, users, workspaces } from "@/db/schema";
import { MEDIA_BUCKET } from "@/lib/media-shared";
import { createSupabaseAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";

/** Apaga do Storage tudo o que o workspace enviou (a pasta tem o id do workspace). */
async function purgeWorkspaceFiles(workspaceId: string) {
  if (!supabaseAdminConfigured()) return;
  const storage = createSupabaseAdminClient().storage.from(MEDIA_BUCKET);
  for (let guard = 0; guard < 100; guard++) {
    const { data } = await storage.list(workspaceId, { limit: 100 });
    if (!data?.length) return;
    await storage.remove(data.map((f) => `${workspaceId}/${f.name}`));
  }
}

/**
 * Remove um workspace por inteiro: mídia no Storage + linhas no banco.
 * As FKs com `onDelete: cascade` levam posts, inbox, métricas, contas, créditos etc.
 */
export async function eraseWorkspace(workspaceId: string) {
  await purgeWorkspaceFiles(workspaceId);
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

/** Apaga o usuário: workspaces que ele é dono, perfil local e conta de login no Supabase. */
export async function eraseUser(userId: string, authId: string) {
  const owned = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, userId));
  for (const ws of owned) await eraseWorkspace(ws.id);
  await db.delete(users).where(eq(users.id, userId));
  if (supabaseAdminConfigured()) {
    await createSupabaseAdminClient().auth.admin.deleteUser(authId);
  }
}

/**
 * Callback da Meta (exclusão/deauthorize): apaga de verdade os dados ligados à
 * conta — tokens, linhas da conta, caixa de entrada e métricas (via cascade).
 * `metaUserId` pode ser o id profissional ou o app-scoped; casa pelos dois.
 */
export async function eraseInstagramAccountData(metaUserId: string) {
  const rows = await db
    .select({ id: socialAccounts.id, externalId: socialAccounts.externalId, appScopedId: socialAccounts.appScopedId, platform: socialAccounts.platform })
    .from(socialAccounts);
  const ids = rows
    .filter((r) => r.platform === "instagram" && (r.externalId === metaUserId || r.appScopedId === metaUserId))
    .map((r) => r.id);
  if (!ids.length) return 0;
  await db.delete(inboxItems).where(inArray(inboxItems.socialAccountId, ids));
  await db.delete(socialAccounts).where(inArray(socialAccounts.id, ids));
  return ids.length;
}
