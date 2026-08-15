import { NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, eq, isNull } from "drizzle-orm";
import { withFreshToken, getVideoList } from "@/lib/tiktok";

export const maxDuration = 30;

/** Vídeos já publicados nas contas TikTok do workspace (escopo `video.list`). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const accounts = (
    await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, user.workspaceId),
          eq(socialAccounts.platform, "tiktok"),
          eq(socialAccounts.connected, true),
          isNull(socialAccounts.deletedAt)
        )
      )
  ).filter((a) => a.accessToken);

  if (accounts.length === 0) return NextResponse.json({ videos: [], noAccount: true });

  const listas = await Promise.all(
    accounts.map(async (acc) => {
      try {
        const videos = await withFreshToken(acc, (token) => getVideoList(token));
        return videos.map((v) => ({ ...v, account: acc.handle }));
      } catch {
        return [];
      }
    })
  );

  const videos = listas.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return NextResponse.json({ videos, fetchedAt: new Date().toISOString() });
}
