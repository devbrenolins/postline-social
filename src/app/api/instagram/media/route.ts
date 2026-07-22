import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getRecentMedia, getMediaInsights } from "@/lib/instagram";
import { and, eq, isNull } from "drizzle-orm";

export const maxDuration = 30;

type IgPost = {
  id: string;
  account: string;
  caption: string;
  mediaType: string;
  mediaUrl: string | null;
  permalink: string;
  timestamp: string;
  likes: number;
  comments: number;
  reach: number;
  saves: number;
  shares: number;
  views: number;
};

// Cache best-effort por workspace, para não chamar a API a cada abertura.
// Some no cold start do serverless — é só uma economia, não fonte de verdade.
const cache = new Map<string, { at: number; posts: IgPost[] }>();
const TTL_MS = 10 * 60 * 1000;

/**
 * Traz, ao vivo, as publicações que a conta já tem no Instagram + engajamento
 * real (alcance, curtidas, comentários, salvos, compartilhamentos, views).
 * Nada é "importado": é sempre buscado sob demanda. `?refresh=1` ignora o cache.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const force = req.nextUrl.searchParams.get("refresh") === "1";
  const cached = cache.get(user.workspaceId);
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ posts: cached.posts, fetchedAt: new Date(cached.at).toISOString(), cached: true });
  }

  const accounts = (
    await db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.workspaceId, user.workspaceId), eq(socialAccounts.platform, "instagram"), eq(socialAccounts.connected, true), isNull(socialAccounts.deletedAt)))
  ).filter((a) => a.externalId && a.accessToken);

  if (accounts.length === 0) {
    return NextResponse.json({ posts: [], fetchedAt: new Date().toISOString(), cached: false, noAccount: true });
  }

  const posts: IgPost[] = [];
  for (const acc of accounts) {
    try {
      const media = await getRecentMedia(acc.externalId!, acc.accessToken!, 24);
      const withInsights = await Promise.all(
        media.map(async (m) => {
          const base: IgPost = {
            id: m.id,
            account: acc.handle,
            caption: m.caption,
            mediaType: m.mediaType,
            mediaUrl: m.mediaUrl,
            permalink: m.permalink,
            timestamp: m.timestamp,
            likes: m.likeCount,
            comments: m.commentsCount,
            reach: 0,
            saves: 0,
            shares: 0,
            views: 0,
          };
          try {
            const ins = await getMediaInsights(m.id, acc.accessToken!);
            return { ...base, reach: ins.reach, saves: ins.saves, shares: ins.shares, views: ins.views, likes: ins.likes || m.likeCount, comments: ins.comments || m.commentsCount };
          } catch {
            return base; // mídia sem insights (muito antiga/indisponível) — mantém likes/comments
          }
        })
      );
      posts.push(...withInsights);
    } catch {
      // Falha em uma conta não derruba as demais.
    }
  }

  posts.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  cache.set(user.workspaceId, { at: Date.now(), posts });
  return NextResponse.json({ posts, fetchedAt: new Date().toISOString(), cached: false });
}
