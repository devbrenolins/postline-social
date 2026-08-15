import { NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { and, eq, isNull } from "drizzle-orm";
import { withFreshToken, getCreatorInfo } from "@/lib/tiktok";

/**
 * Dados que o TikTok exige mostrar **antes** de publicar: o apelido do criador
 * (para o usuário saber em qual conta o conteúdo vai cair) e as opções de
 * privacidade válidas para aquela conta, que precisam ser escolhidas à mão.
 */
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

  if (accounts.length === 0) return NextResponse.json({ accounts: [] });

  const infos = await Promise.all(
    accounts.map(async (acc) => {
      try {
        const info = await withFreshToken(acc, (token) => getCreatorInfo(token));
        return {
          id: acc.id,
          handle: acc.handle,
          nickname: info.nickname || acc.displayName || acc.handle,
          avatarUrl: info.avatarUrl ?? acc.avatarUrl,
          privacyOptions: info.privacyOptions,
          maxVideoSeconds: info.maxVideoSeconds,
          commentDisabled: info.commentDisabled,
          duetDisabled: info.duetDisabled,
          stitchDisabled: info.stitchDisabled,
        };
      } catch (e) {
        return { id: acc.id, handle: acc.handle, error: e instanceof Error ? e.message : "Falha ao consultar o TikTok." };
      }
    })
  );

  return NextResponse.json({ accounts: infos });
}
