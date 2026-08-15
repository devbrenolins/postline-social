import { db } from "@/db";
import { posts, socialAccounts } from "@/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  createMediaContainer,
  createCarouselContainer,
  publishMediaContainer,
  getContainerStatus,
  getPublishingLimit,
  type PublishExtras,
} from "@/lib/instagram";

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

/** Vídeos processam mais devagar (até ~60s); imagens ficam prontas em 1–2s. */
async function waitFor(url: string, creationId: string, token: string) {
  if (isVideo(url)) await waitForContainer(creationId, token, 20, 3000);
  else await waitForContainer(creationId, token, 15, 1000);
}

type PublishJob = {
  mediaUrls: string[];
  caption: string;
  format: string;
  extras: PublishExtras;
};

/**
 * Monta e publica o container certo para o formato escolhido no composer.
 *
 * - `story`: uma publicação por mídia (é assim que o Instagram trata stories).
 * - `carousel` (ou várias mídias no feed): containers-filho + container pai.
 * - resto: imagem única, ou reel quando a mídia é vídeo.
 */
async function publishToAccount(igId: string, token: string, handle: string, job: PublishJob): Promise<PublishResult[]> {
  const { mediaUrls, caption, format, extras } = job;

  try {
    if (format === "story") {
      const results: PublishResult[] = [];
      for (const url of mediaUrls) {
        const creationId = await createMediaContainer(igId, token, {
          ...(isVideo(url) ? { videoUrl: url } : { imageUrl: url }),
          mediaType: "STORIES",
        });
        await waitFor(url, creationId, token);
        results.push({ account: handle, ok: true, mediaId: await publishMediaContainer(igId, token, creationId) });
      }
      return results;
    }

    const isCarousel = format === "carousel" || (mediaUrls.length > 1 && format !== "reel");
    if (isCarousel) {
      const childIds: string[] = [];
      for (const [i, url] of mediaUrls.slice(0, 10).entries()) {
        const childId = await createMediaContainer(igId, token, {
          ...(isVideo(url) ? { videoUrl: url } : { imageUrl: url }),
          isCarouselItem: true,
          altText: extras.altTexts?.[i],
        });
        await waitFor(url, childId, token);
        childIds.push(childId);
      }
      const parentId = await createCarouselContainer(igId, token, childIds, caption, extras);
      await waitForContainer(parentId, token, 20, 1500);
      return [{ account: handle, ok: true, mediaId: await publishMediaContainer(igId, token, parentId) }];
    }

    const url = mediaUrls[0];
    const creationId = await createMediaContainer(igId, token, {
      ...(isVideo(url) ? { videoUrl: url, mediaType: "REELS" } : { imageUrl: url }),
      caption,
      ...extras,
      altText: extras.altTexts?.[0] ?? extras.altText,
    });
    await waitFor(url, creationId, token);
    return [{ account: handle, ok: true, mediaId: await publishMediaContainer(igId, token, creationId) }];
  } catch (e) {
    return [{ account: handle, ok: false, error: e instanceof Error ? e.message : "Falha ao publicar." }];
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

  const fail = async (message: string): Promise<never> => {
    await db.update(posts).set({ status: "failed", updatedAt: new Date() }).where(eq(posts.id, post.id));
    throw new Error(message);
  };

  const mediaUrls = (post.mediaUrls ?? []).filter(Boolean);
  if (mediaUrls.length === 0) await fail("O post precisa de ao menos uma mídia (URL pública) para publicar.");
  // A Graph API do Instagram baixa a mídia da URL: precisa ser HTTP(S) pública.
  // Data URIs (base64) ou blobs locais não funcionam.
  if (mediaUrls.some((u) => !/^https?:\/\//i.test(u))) {
    await fail("A mídia precisa ser uma URL pública (http/https). Faça upload da imagem antes de publicar.");
  }
  if (post.format === "carousel" && mediaUrls.length < 2) {
    await fail("Um carrossel precisa de pelo menos 2 mídias.");
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
    await fail("Nenhuma conta Instagram conectada para publicar. Conecte uma conta em Clientes.");
  }

  // A Meta limita publicações por 24h e recusa a chamada quando estoura. Ver
  // antes vira mensagem clara em vez de erro cru da API no meio do processo.
  const quotas = await Promise.all(
    usable.map(async (acc) => ({ acc, quota: await getPublishingLimit(acc.externalId!, acc.accessToken!) }))
  );
  const blocked = quotas.filter(({ quota }) => quota.used >= quota.total);
  if (blocked.length === usable.length) {
    await fail(`Limite de publicações do Instagram atingido (${blocked[0].quota.used}/${blocked[0].quota.total} nas últimas 24h). Tente mais tarde.`);
  }

  const options = post.publishOptions ?? {};
  const job: PublishJob = {
    mediaUrls,
    caption: post.caption ?? "",
    format: post.format,
    extras: {
      locationId: options.locationId,
      collaborators: options.collaborators,
      userTags: options.userTags,
      altTexts: options.altTexts,
      coverUrl: options.coverUrl,
      thumbOffset: options.thumbOffset,
      shareToFeed: options.shareToFeed,
    },
  };

  const results: PublishResult[] = [];
  const externalMedia: { socialAccountId: string; mediaId: string }[] = [];
  for (const { acc, quota } of quotas) {
    if (quota.used >= quota.total) {
      results.push({ account: acc.handle, ok: false, error: "Limite de publicações das últimas 24h atingido." });
      continue;
    }
    const accountResults = await publishToAccount(acc.externalId!, acc.accessToken!, acc.handle, job);
    results.push(...accountResults);
    for (const r of accountResults) {
      if (r.ok && r.mediaId) externalMedia.push({ socialAccountId: acc.id, mediaId: r.mediaId });
    }
  }

  const anyOk = results.some((r) => r.ok);
  const status = anyOk ? "published" : "failed";
  await db
    .update(posts)
    // Guarda os media IDs do IG para buscar insights reais depois; zera as
    // métricas (serão preenchidas na próxima sincronização) e marca como
    // pendente de sync para o refresh atualizar assim que possível.
    .set({
      status,
      publishedAt: anyOk ? new Date() : null,
      externalMedia: anyOk ? externalMedia : [],
      metrics: { likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, views: 0, clicks: 0 },
      metricsSyncedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, post.id));

  return { status, results };
}
