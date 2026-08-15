import { db } from "@/db";
import { media } from "@/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export { MEDIA_BUCKET } from "@/lib/media-shared";
import { MEDIA_BUCKET } from "@/lib/media-shared";

/**
 * Normaliza qualquer imagem para JPEG publicável no Instagram: achata a
 * transparência em fundo branco, respeita a orientação EXIF e limita a
 * largura a 1440px (máximo aceito pelo feed). Só reduz, nunca amplia.
 *
 * O `sharp` é carregado sob demanda (import dinâmico) porque usa binários
 * nativos: se ele falhar em carregar no runtime, o erro é capturado pelo
 * chamador e o upload segue com o arquivo original — em vez de derrubar a rota.
 */
export async function toInstagramJpeg(buffer: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
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

/**
 * Registra na biblioteca um arquivo que já foi parar no Storage — caminho usado
 * pelo upload direto do navegador (ver `src/lib/upload-client.ts`), em que os
 * bytes nunca passam pela função serverless.
 */
export async function registerMedia(opts: {
  workspaceId: string;
  path: string;
  name: string;
  type: "image" | "video";
  sizeKb: number;
  folderId?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(opts.path);
  const url = pub.publicUrl;

  const [row] = await db
    .insert(media)
    .values({
      workspaceId: opts.workspaceId,
      folderId: opts.folderId ?? null,
      name: opts.name.slice(0, 200),
      url,
      type: opts.type,
      sizeKb: Math.max(1, Math.floor(opts.sizeKb)),
    })
    .returning();

  return { media: row, url };
}
