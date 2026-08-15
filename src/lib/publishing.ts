import { db } from "@/db";
import { posts, socialAccounts } from "@/db/schema";
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import {
  createMediaContainer,
  createCarouselContainer,
  publishMediaContainer,
  getContainerStatus,
  getPublishingLimit,
  type PublishExtras,
} from "@/lib/instagram";
import { withFreshToken, uploadMedia, createPost, splitIntoThread, X_CHAR_LIMIT } from "@/lib/x";
import * as tiktok from "@/lib/tiktok";
import type { Platform } from "@/db/schema";

export type PublishResult = { account: string; ok: boolean; mediaId?: string; error?: string };

/** Redes com integração de verdade. As demais aparecem na UI mas não publicam. */
const SUPPORTED: Platform[] = ["instagram", "x", "tiktok"];

/**
 * Teto mensal de publicações no X — freio de gasto, não limite técnico.
 *
 * O X cobra por publicação (US$ 0,015, ou US$ 0,20 quando o texto tem link) a
 * partir de crédito pré-pago. Sem um teto, um agendamento em massa ou um laço
 * defeituoso consome saldo real. A contagem é por post, então uma thread gasta
 * mais que o contabilizado aqui. Ajuste por `X_MONTHLY_POST_LIMIT`.
 */
const X_MONTHLY_LIMIT = Number(process.env.X_MONTHLY_POST_LIMIT ?? 450);

type Account = typeof socialAccounts.$inferSelect;
type Media = { socialAccountId: string; mediaId: string };

function isVideo(url: string) {
  return /\.(mp4|mov|m4v)(\?|$)/i.test(url);
}

/* ------------------------------------------------------------------ */
/*  Instagram                                                          */
/* ------------------------------------------------------------------ */

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
async function publishToInstagramAccount(igId: string, token: string, handle: string, job: PublishJob): Promise<PublishResult[]> {
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

async function publishToInstagram(accounts: Account[], job: PublishJob): Promise<{ results: PublishResult[]; media: Media[] }> {
  const results: PublishResult[] = [];
  const media: Media[] = [];

  if (accounts.length === 0) {
    return { results: [{ account: "Instagram", ok: false, error: "Nenhuma conta Instagram conectada. Conecte uma em Clientes." }], media };
  }
  if (job.mediaUrls.length === 0) {
    return { results: [{ account: "Instagram", ok: false, error: "O Instagram exige ao menos uma mídia para publicar." }], media };
  }
  if (job.format === "carousel" && job.mediaUrls.length < 2) {
    return { results: [{ account: "Instagram", ok: false, error: "Um carrossel precisa de pelo menos 2 mídias." }], media };
  }

  for (const acc of accounts) {
    // A Meta limita publicações por 24h e recusa a chamada quando estoura. Ver
    // antes vira mensagem clara em vez de erro cru no meio do processo.
    const quota = await getPublishingLimit(acc.externalId!, acc.accessToken!);
    if (quota.used >= quota.total) {
      results.push({ account: acc.handle, ok: false, error: `Limite de publicações do Instagram atingido (${quota.used}/${quota.total} em 24h).` });
      continue;
    }
    const accountResults = await publishToInstagramAccount(acc.externalId!, acc.accessToken!, acc.handle, job);
    results.push(...accountResults);
    for (const r of accountResults) {
      if (r.ok && r.mediaId) media.push({ socialAccountId: acc.id, mediaId: r.mediaId });
    }
  }
  return { results, media };
}

/* ------------------------------------------------------------------ */
/*  X                                                                  */
/* ------------------------------------------------------------------ */

/**
 * Publica no X dentro do que o plano gratuito permite: texto (em thread quando
 * passa de 280 caracteres) e até 4 mídias no primeiro post.
 */
async function publishToX(accounts: Account[], job: PublishJob): Promise<{ results: PublishResult[]; media: Media[] }> {
  const results: PublishResult[] = [];
  const media: Media[] = [];

  if (accounts.length === 0) {
    return { results: [{ account: "X", ok: false, error: "Nenhuma conta do X conectada. Conecte uma em Clientes." }], media };
  }
  if (!job.caption.trim() && job.mediaUrls.length === 0) {
    return { results: [{ account: "X", ok: false, error: "Escreva um texto ou adicione mídia para publicar no X." }], media };
  }

  const used = await countXPostsThisMonth();
  if (used >= X_MONTHLY_LIMIT) {
    return {
      results: [{ account: "X", ok: false, error: `Teto mensal de publicações no X atingido (${used}/${X_MONTHLY_LIMIT}). Ajuste X_MONTHLY_POST_LIMIT se for intencional.` }],
      media,
    };
  }

  for (const acc of accounts) {
    try {
      const published = await withFreshToken(acc, async (token) => {
        // Mídia é opcional no X e o upload é a parte mais frágil do plano
        // gratuito: se falhar, publicamos o texto em vez de perder o post.
        const mediaIds: string[] = [];
        for (const url of job.mediaUrls.slice(0, 4)) {
          try {
            mediaIds.push(await uploadMedia(token, url));
          } catch {
            break;
          }
        }

        const parts = splitIntoThread(job.caption.trim() || " ", X_CHAR_LIMIT);
        let replyTo: string | undefined;
        let firstId = "";
        for (const [i, text] of parts.entries()) {
          const created = await createPost(token, {
            text,
            // As mídias vão só no primeiro post da thread.
            mediaIds: i === 0 ? mediaIds : undefined,
            replyTo,
            username: acc.handle,
          });
          replyTo = created.id;
          if (i === 0) firstId = created.id;
        }
        return { firstId, semMidia: job.mediaUrls.length > 0 && mediaIds.length === 0 };
      });

      results.push({
        account: acc.handle,
        ok: true,
        mediaId: published.firstId,
        error: published.semMidia
          ? "Publicado sem a mídia: o envio do arquivo falhou (pode estar fora do plano gratuito)."
          : undefined,
      });
      media.push({ socialAccountId: acc.id, mediaId: published.firstId });
    } catch (e) {
      results.push({ account: acc.handle, ok: false, error: e instanceof Error ? e.message : "Falha ao publicar no X." });
    }
  }
  return { results, media };
}

/** Publicações deste mês que miraram o X — base do controle de cota. */
async function countXPostsThisMonth(): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(posts)
    .where(and(eq(posts.status, "published"), gte(posts.publishedAt, start), sql`${posts.networks}::jsonb ? 'x'`));
  return Number(rows[0]?.n ?? 0);
}

/* ------------------------------------------------------------------ */
/*  TikTok                                                             */
/* ------------------------------------------------------------------ */

/** Quanto esperamos o TikTok baixar e processar a mídia antes de desistir. */
const TIKTOK_POLL_ATTEMPTS = 10;
const TIKTOK_POLL_DELAY_MS = 3000;

/**
 * Publica no TikTok via `PULL_FROM_URL`: mandamos a URL e ele baixa.
 *
 * O `init` só enfileira — o resultado real vem no polling de status. Sem essa
 * espera, um vídeo recusado por formato ou por domínio não verificado seria
 * marcado como publicado aqui e nunca apareceria no perfil.
 */
async function publishToTikTok(accounts: Account[], job: PublishJob): Promise<{ results: PublishResult[]; media: Media[] }> {
  const results: PublishResult[] = [];
  const media: Media[] = [];

  if (accounts.length === 0) {
    return { results: [{ account: "TikTok", ok: false, error: "Nenhuma conta do TikTok conectada. Conecte uma em Clientes." }], media };
  }
  if (job.mediaUrls.length === 0) {
    return { results: [{ account: "TikTok", ok: false, error: "O TikTok exige um vídeo ou fotos para publicar." }], media };
  }

  for (const acc of accounts) {
    try {
      const publishId = await tiktok.withFreshToken(acc, async (token) => {
        // O TikTok recusa `privacy_level` que a conta não ofereça, então a
        // consulta ao criador não é opcional.
        const info = await tiktok.getCreatorInfo(token);
        const privacy = tiktok.resolvePrivacy(info.privacyOptions);
        const opts: tiktok.PostOptions = {
          title: job.caption,
          disableComment: info.commentDisabled,
          disableDuet: info.duetDisabled,
          disableStitch: info.stitchDisabled,
        };

        const videos = job.mediaUrls.filter(isVideo);
        return videos.length > 0
          ? tiktok.postVideo(token, videos[0], privacy, opts)
          : tiktok.postPhotos(token, job.mediaUrls, privacy, opts);
      });

      const final = await aguardarTikTok(acc, publishId);
      if (final.ok) {
        results.push({ account: acc.handle, ok: true, mediaId: final.postId || publishId, error: final.aviso });
        media.push({ socialAccountId: acc.id, mediaId: final.postId || publishId });
      } else {
        results.push({ account: acc.handle, ok: false, error: final.erro });
      }
    } catch (e) {
      results.push({ account: acc.handle, ok: false, error: e instanceof Error ? e.message : "Falha ao publicar no TikTok." });
    }
  }
  return { results, media };
}

/** Acompanha o processamento até concluir, falhar ou estourar a paciência. */
async function aguardarTikTok(
  acc: Account,
  publishId: string
): Promise<{ ok: boolean; postId?: string; erro?: string; aviso?: string }> {
  for (let i = 0; i < TIKTOK_POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, TIKTOK_POLL_DELAY_MS));
    const status = await tiktok.withFreshToken(acc, (token) => tiktok.getPublishStatus(token, publishId));

    if (status.status === "PUBLISH_COMPLETE") {
      return { ok: true, postId: status.postIds[0] };
    }
    if (status.status === "FAILED") {
      return { ok: false, erro: tiktok.explainFailure(status.failReason) };
    }
    if (status.status === "SEND_TO_USER_INBOX") {
      // App sem auditoria, ou modo rascunho: saiu do nosso lado, mas o usuário
      // precisa concluir dentro do TikTok.
      return { ok: true, postId: publishId, aviso: "Enviado para o TikTok, mas ficou na caixa de entrada do app — conclua a publicação no aplicativo." };
    }
  }
  // Ainda processando: não é erro, mas também não dá para prometer que saiu.
  return { ok: true, postId: publishId, aviso: "O TikTok ainda está processando a mídia. Confira no aplicativo em alguns minutos." };
}

/* ------------------------------------------------------------------ */
/*  Orquestração                                                       */
/* ------------------------------------------------------------------ */

/**
 * Publica um post em todas as redes marcadas no composer.
 *
 * Cada rede é independente: falha numa não impede a outra, e o resultado
 * detalha conta a conta. O post vira `published` se ao menos uma deu certo.
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

  const networks = (post.networks ?? []).length > 0 ? post.networks : (["instagram"] as Platform[]);
  const mediaUrls = (post.mediaUrls ?? []).filter(Boolean);

  // As duas integrações baixam a mídia a partir da URL: precisa ser pública.
  // Data URI (base64) ou blob local não funcionam em nenhuma das duas.
  if (mediaUrls.some((u) => !/^https?:\/\//i.test(u))) {
    await fail("A mídia precisa ser uma URL pública (http/https). Faça upload da imagem antes de publicar.");
  }
  if (!networks.some((n) => SUPPORTED.includes(n))) {
    await fail(`Ainda não publicamos em ${networks.join(", ")}. Marque Instagram, X ou TikTok no post.`);
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
  const externalMedia: Media[] = [];

  for (const network of networks) {
    if (!SUPPORTED.includes(network)) {
      results.push({ account: network, ok: false, error: "Integração ainda não disponível nesta rede." });
      continue;
    }
    const accounts = await accountsFor(workspaceId, network, post.clientId);
    const out =
      network === "instagram"
        ? await publishToInstagram(accounts, job)
        : network === "x"
          ? await publishToX(accounts, job)
          : await publishToTikTok(accounts, job);
    results.push(...out.results);
    externalMedia.push(...out.media);
  }

  const anyOk = results.some((r) => r.ok);
  const status = anyOk ? "published" : "failed";
  await db
    .update(posts)
    // Guarda os IDs das publicações para buscar métricas depois; zera as
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

/** Contas conectadas de uma rede: as do cliente do post, ou as do workspace. */
async function accountsFor(workspaceId: string, platform: Platform, clientId: string | null): Promise<Account[]> {
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.platform, platform),
        eq(socialAccounts.connected, true),
        isNull(socialAccounts.deletedAt),
        // Conta vinculada ao cliente do post OU conta do workspace (sem cliente).
        ...(clientId ? [or(eq(socialAccounts.clientId, clientId), isNull(socialAccounts.clientId))] : [])
      )
    );
  return rows.filter((a) => a.externalId && a.accessToken);
}
