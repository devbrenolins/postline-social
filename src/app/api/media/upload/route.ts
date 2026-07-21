import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { saveMedia, toInstagramJpeg } from "@/lib/media";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * Upload de mídia para o Supabase Storage (bucket público `media`) e registro
 * na biblioteca. Retorna a URL PÚBLICA — essencial para publicar no Instagram,
 * que precisa baixar a mídia de uma URL acessível (não aceita data: URI).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const folderId = (form.get("folderId") as string) || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo muito grande (máx. 50MB)." }, { status: 413 });

  const isVideo = file.type.startsWith("video");
  const isImage = file.type.startsWith("image");

  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let contentType = file.type || "application/octet-stream";
  let ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";

  // O Instagram só publica imagens em JPEG. Normaliza qualquer imagem (PNG,
  // WebP, etc.) para JPEG antes de enviar ao Storage.
  if (isImage) {
    try {
      buffer = await toInstagramJpeg(buffer);
      contentType = "image/jpeg";
      ext = "jpg";
    } catch {
      // Se a conversão falhar (ex.: formato exótico), segue com o arquivo original.
    }
  }

  try {
    const { media: row, url } = await saveMedia({
      workspaceId: user.workspaceId,
      buffer,
      contentType,
      ext,
      name: file.name,
      type: isVideo ? "video" : "image",
      folderId,
    });
    return NextResponse.json({ media: row, url }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha no upload." }, { status: 502 });
  }
}
