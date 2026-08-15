import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { MEDIA_BUCKET, registerMedia } from "@/lib/media";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024; // 50MB — mesmo teto do bucket

/**
 * Upload direto navegador → Supabase Storage, em duas etapas.
 *
 * A função serverless da Vercel recusa corpos acima de ~4,5MB com 413 antes do
 * nosso código rodar — por isso vídeos e fotos grandes não podem passar por
 * `/api/media/upload`. Aqui só trafegam metadados: o POST devolve uma URL
 * assinada e o navegador envia os bytes direto ao Storage; o PUT registra o
 * arquivo na biblioteca depois que ele chega.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { name, contentType, size } = await req.json();
  if (typeof size === "number" && size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. 50MB)." }, { status: 413 });
  }

  const ext = (String(name ?? "").split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${user.workspaceId}/${crypto.randomUUID()}.${ext}`;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Falha ao preparar o upload." }, { status: 502 });
  }

  return NextResponse.json({ path: data.path, token: data.token, contentType: contentType ?? null });
}

/** Segunda etapa: o arquivo já está no Storage, falta entrar na biblioteca. */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { path, name, type, sizeKb, folderId } = await req.json();

  // O caminho vem do cliente: só aceitamos o que está dentro do workspace dele,
  // senão daria para registrar (e expor) mídia de outro workspace.
  if (typeof path !== "string" || !path.startsWith(`${user.workspaceId}/`)) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  try {
    const { media: row, url } = await registerMedia({
      workspaceId: user.workspaceId,
      path,
      name: String(name || path.split("/").pop()),
      type: type === "video" ? "video" : "image",
      sizeKb: Number(sizeKb) || 1,
      folderId: folderId || null,
    });
    return NextResponse.json({ media: row, url }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao registrar." }, { status: 502 });
  }
}
