import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { media } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "media";
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
  const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${user.workspaceId}/${crypto.randomUUID()}.${ext}`;

  const supabase = createSupabaseAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: `Falha no upload: ${upErr.message}` }, { status: 502 });

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const [row] = await db
    .insert(media)
    .values({
      workspaceId: user.workspaceId,
      folderId,
      name: file.name.slice(0, 200),
      url,
      type: isVideo ? "video" : "image",
      sizeKb: Math.max(1, Math.floor(file.size / 1024)),
    })
    .returning();

  return NextResponse.json({ media: row, url }, { status: 201 });
}
