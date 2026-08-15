import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getWorkspaceMedia, getWorkspaceOverview } from "@/lib/ig-media";

export const maxDuration = 30;

/**
 * Traz, ao vivo, as publicações que a conta já tem no Instagram + engajamento
 * real. `?refresh=1` ignora o cache.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const force = req.nextUrl.searchParams.get("refresh") === "1";
  const [{ media, fetchedAt, cached, noAccount }, overview] = await Promise.all([
    getWorkspaceMedia(user.workspaceId, { force }),
    getWorkspaceOverview(user.workspaceId, { force }).catch(() => null),
  ]);

  return NextResponse.json({
    posts: media,
    fetchedAt,
    cached,
    profile: overview?.profile ?? null,
    stories: overview?.stories ?? [],
    tagged: overview?.tagged ?? [],
    quota: overview?.quota ?? null,
    ...(noAccount ? { noAccount: true } : {}),
  });
}
