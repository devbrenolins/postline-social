/** Nome do bucket, isolado para poder ser importado também no cliente —
 * `@/lib/media` puxa o banco e o service role, que não podem ir ao navegador. */
export const MEDIA_BUCKET = "media";

/** Extensões aceitas na biblioteca (o Instagram/TikTok/X só trabalham com estas). */
export const ALLOWED_IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif"];
export const ALLOWED_VIDEO_EXT = ["mp4", "mov", "m4v", "webm"];

export function mediaKindFromExt(ext: string): "image" | "video" | null {
  const e = ext.toLowerCase();
  if (ALLOWED_IMAGE_EXT.includes(e)) return "image";
  if (ALLOWED_VIDEO_EXT.includes(e)) return "video";
  return null;
}

/** Confere os primeiros bytes: o `Content-Type` do cliente não é prova de nada. */
export function sniffMedia(buf: Uint8Array): "image" | "video" | null {
  const at = (i: number) => buf[i];
  if (at(0) === 0xff && at(1) === 0xd8) return "image"; // JPEG
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image"; // PNG
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return "image"; // GIF
  const ascii = (a: number, b: number) => String.fromCharCode(...Array.from(buf.slice(a, b)));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image";
  if (ascii(4, 8) === "ftyp") return "video"; // MP4/MOV/M4V
  if (at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3) return "video"; // WebM
  return null;
}
