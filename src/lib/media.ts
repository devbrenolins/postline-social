import sharp from "sharp";
import { db } from "@/db";
import { media } from "@/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const MEDIA_BUCKET = "media";

/**
 * Normaliza qualquer imagem para JPEG publicável no Instagram: achata a
 * transparência em fundo branco, respeita a orientação EXIF e limita a
 * largura a 1440px (máximo aceito pelo feed). Só reduz, nunca amplia.
 */
export async function toInstagramJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: 1440, withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88 })
    .toBuffer();
}

/**
 * Envia um buffer para o Supabase Storage (bucket público `media`) e registra
 * na biblioteca. Retorna a URL PÚBLICA — essencial para publicar no Instagram,
 * que precisa baixar a mídia de uma URL acessível (não aceita data: URI).
 */
export async function saveMedia(opts: {
  workspaceId: string;
  buffer: Buffer;
  contentType: string;
  ext: string;
  name: string;
  type: "image" | "video";
  folderId?: string | null;
}) {
  const path = `${opts.workspaceId}/${crypto.randomUUID()}.${opts.ext}`;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, opts.buffer, {
    contentType: opts.contentType,
    upsert: false,
  });
  if (error) throw new Error(`Falha no upload: ${error.message}`);

  const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const [row] = await db
    .insert(media)
    .values({
      workspaceId: opts.workspaceId,
      folderId: opts.folderId ?? null,
      name: opts.name.slice(0, 200),
      url,
      type: opts.type,
      sizeKb: Math.max(1, Math.floor(opts.buffer.length / 1024)),
    })
    .returning();

  return { media: row, url };
}
