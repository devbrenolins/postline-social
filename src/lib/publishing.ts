import { db } from "@/db";
import { posts, socialAccounts } from "@/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { createMediaContainer, publishMediaContainer, getContainerStatus } from "@/lib/instagram";

export type PublishResult = { account: string; ok: boolean; mediaId?: string; error?: string };

function isVideo(url: string) {
  return /\.(mp4|mov|m4v)(\?|$)/i.test(url);
}

/**
 * Aguarda o container de mídia ficar FINISHED antes de publicar. O Instagram
 * processa a mídia de forma assíncrona — inclusive imagens, que costumam levar
 * 1–2s. Publicar antes do FINISHED faz o media_publish falhar (foi a causa dos
 * 502 ao postar no feed).
 */
async function waitForContainer(creationId: string, token: string, attempts: number, delayMs: number) {
  for (let i = 0; i < attempts; i++) {
    const status = await getContainerStatus(creationId, token);
    if (status === "FINISHED") return;
    if (status === "ERROR") throw new Error("Falha ao processar a mídia no Instagram.");
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("A mídia demorou demais para processar no Instagram. Tente novamente.");
}

async function publishToAccount(
  igId: string,
  token: string,
  handle: string,
  mediaUrl: string,
  caption: string
): Promise<PublishResult> {
  try {
    const creationId = isVideo(mediaUrl)
      ? await createMediaContainer(igId, token, { videoUrl: mediaUrl, caption, mediaType: "REELS" })
      : await createMediaContainer(igId, token, { imageUrl: mediaUrl, caption });

    // Vídeos processam mais devagar (até ~60s); imagens costumam ficar prontas
    // em 1–2s, mas ainda precisam do FINISHED antes de publicar.
    if (isVideo(mediaUrl)) {
      await waitForContainer(creationId, token, 20, 3000);
    } else {
      await waitForContainer(creationId, token, 15, 1000);
    }

    const mediaId = await publishMediaContainer(igId, token, creationId);
    return { account: handle, ok: true, mediaId };
  } catch (e) {
    return { account: handle, ok: false, error: e instanceof Error ? e.message : "Falha ao publicar." };
  }
}

/**
 * Publica um post nas contas Instagram do workspace (as do cliente do post,
 * ou todas as contas IG conectadas quando o post não tem cliente).
 * Atualiza o status do post para published/failed.
 */
export async function publishPost(postId: string, workspaceId: string): Promise<{ status: string; results: PublishResult[] }> {
  const post = (
    await db
      .select()
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId), isNull(posts.deletedAt)))
      .limit(1)
  )[0];
  if (!post) throw new Error("Post não encontrado.");

  const mediaUrl = post.mediaUrls?.[0];
  if (!mediaUrl) {
    await db.update(posts).set({ status: "failed", updatedAt: new Date() }).where(eq(posts.id, post.id));
    throw new Error("O post precisa de ao menos uma mídia (URL pública) para publicar.");
  }
  // A Graph API do Instagram baixa a mídia da URL: precisa ser HTTP(S) pública.
  // Data URIs (base64) ou blobs locais não funcionam.
  if (!/^https?:\/\//i.test(mediaUrl)) {
    await db.update(posts).set({ status: "failed", updatedAt: new Date() }).where(eq(posts.id, post.id));
    throw new Error("A mídia precisa ser uma URL pública (http/https). Faça upload da imagem antes de publicar.");
  }

  const targets = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.platform, "instagram"),
        eq(socialAccounts.connected, true),
        isNull(socialAccounts.deletedAt),
        // Conta vinculada ao cliente do post OU conta do workspace (sem cliente).
        ...(post.clientId
          ? [or(eq(socialAccounts.clientId, post.clientId), isNull(socialAccounts.clientId))]
          : [])
      )
    );

  const usable = targets.filter((a) => a.externalId && a.accessToken);
  if (usable.length === 0) {
    await db.update(posts).set({ status: "failed", updatedAt: new Date() }).where(eq(posts.id, post.id));
    throw new Error("Nenhuma conta Instagram conectada para publicar. Conecte uma conta em Clientes.");
  }

  const results: PublishResult[] = [];
  for (const acc of usable) {
    results.push(await publishToAccount(acc.externalId!, acc.accessToken!, acc.handle, mediaUrl, post.caption ?? ""));
  }

  const anyOk = results.some((r) => r.ok);
  const status = anyOk ? "published" : "failed";
  await db
    .update(posts)
    .set({ status, publishedAt: anyOk ? new Date() : null, updatedAt: new Date() })
    .where(eq(posts.id, post.id));

  return { status, results };
}
