import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { parseSignedRequest } from "@/lib/meta";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Callback de exclusão de dados exigido pela App Review da Meta.
 *
 * A Meta chama esta rota quando alguém remove o app pelas configurações do
 * Instagram. Precisamos apagar os dados vinculados àquela conta e responder com
 * uma URL de acompanhamento e um código de confirmação.
 *
 * A mesma rota atende o callback de "deauthorize", que tem o formato idêntico.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");

  if (typeof signedRequest !== "string") {
    return NextResponse.json({ error: "signed_request ausente." }, { status: 400 });
  }

  const parsed = parseSignedRequest(signedRequest);
  if (!parsed?.user_id) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  // Desconecta a conta e descarta o token. O conteúdo do workspace continua com
  // o titular — a remoção completa é feita pelo fluxo de exclusão de conta.
  await db
    .update(socialAccounts)
    .set({ connected: false, accessToken: null, deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(socialAccounts.externalId, parsed.user_id), eq(socialAccounts.platform, "instagram")));

  const confirmationCode = randomUUID();
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  return NextResponse.json({
    url: `${base}/exclusao-de-dados?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
