import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { pushConfigured, sendPushToUsers } from "@/lib/push";

/** Estado atual: o servidor sabe enviar push? Este dispositivo está inscrito? */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const endpoint = req.nextUrl.searchParams.get("endpoint");
  let subscribed = false;
  if (endpoint) {
    const rows = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)))
      .limit(1);
    subscribed = rows.length > 0;
  }
  return NextResponse.json({ configured: pushConfigured(), subscribed });
}

/** Registra (ou reatribui) a inscrição deste dispositivo. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    test?: boolean;
  } | null;

  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Inscrição inválida." }, { status: 400 });
  }

  // O endpoint é único: o mesmo navegador reinscrevendo cai aqui e atualiza a
  // linha. O `set` do userId cobre a troca de conta no mesmo aparelho — sem ele,
  // o dispositivo continuaria recebendo os avisos do usuário anterior.
  try {
    await db
      .insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint,
        p256dh,
        auth,
        userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, p256dh, auth, updatedAt: new Date() },
      });
  } catch (e) {
    console.error("[push] falha ao gravar inscrição", e);
    return NextResponse.json({ error: "Não foi possível salvar a inscrição." }, { status: 500 });
  }

  // Confirma pro usuário que funcionou — sem isso ele ativa e fica no escuro.
  // Uma falha aqui não invalida a inscrição, que já está salva: o retorno diz
  // que gravou mas não entregou, e a UI mostra isso em vez de um erro cego.
  let entregue = true;
  if (body?.test !== false) {
    try {
      const enviados = await sendPushToUsers([user.id], {
        title: "Notificações ativadas",
        body: "Você receberá avisos dos seus posts agendados por aqui.",
        url: "/dashboard",
        kind: "success",
      });
      entregue = enviados > 0;
    } catch (e) {
      console.error("[push] falha no push de confirmação", e);
      entregue = false;
    }
  }

  return NextResponse.json({ ok: true, entregue });
}

/** Remove a inscrição deste dispositivo. */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const endpoint = (await req.json().catch(() => null))?.endpoint as string | undefined;
  if (!endpoint) return NextResponse.json({ error: "Endpoint ausente." }, { status: 400 });

  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));

  return NextResponse.json({ ok: true });
}
