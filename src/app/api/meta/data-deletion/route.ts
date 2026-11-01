import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eraseInstagramAccountData } from "@/lib/erase";
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

  // Apaga de verdade: tokens, conta, caixa de entrada e métricas ligadas a ela.
  // O `user_id` da Meta pode ser o id profissional ou o app-scoped.
  await eraseInstagramAccountData(parsed.user_id);

  const confirmationCode = randomUUID();
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  return NextResponse.json({
    url: `${base}/exclusao-de-dados?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
