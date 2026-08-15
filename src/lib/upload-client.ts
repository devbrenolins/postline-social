"use client";

import { MEDIA_BUCKET } from "@/lib/media-shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Acima disto o corpo não chega na função serverless: a Vercel corta com 413
 * (limite de ~4,5MB por requisição). Ficamos abaixo com folga por causa do
 * envelope do multipart.
 */
const LIMITE_SERVERLESS = 3.5 * 1024 * 1024;

/** Mesmo alvo do `toInstagramJpeg` no servidor. */
const LARGURA_MAX = 1440;

export type UploadResult = { url: string; name: string };

/**
 * Envia um arquivo para a biblioteca de mídia escolhendo a rota viável.
 *
 * Imagens são normalizadas para JPEG aqui mesmo (redimensionadas e achatadas
 * em fundo branco, como o Instagram exige) — o que, de quebra, derruba quase
 * toda foto de celular para bem abaixo do limite da função. O que ainda passar
 * do limite — vídeos, sobretudo — vai direto ao Storage por URL assinada, sem
 * atravessar a função.
 */
export async function uploadMedia(file: File, folderId?: string | null): Promise<UploadResult> {
  const isVideo = file.type.startsWith("video");
  const enviar = file.type.startsWith("image") ? await paraJpeg(file) : file;

  if (enviar.size <= LIMITE_SERVERLESS) {
    const fd = new FormData();
    fd.append("file", enviar);
    if (folderId) fd.append("folderId", folderId);
    const res = await fetch("/api/media/upload", { method: "POST", body: fd });
    if (res.ok) return { url: (await res.json()).url, name: file.name };
    // 413 da própria Vercel vem em HTML: sem isto o erro chegava vazio na tela.
    if (res.status !== 413) throw new Error(await mensagemDeErro(res));
  }

  return uploadDireto(enviar, file.name, isVideo ? "video" : "image", folderId);
}

/** Etapa 1: URL assinada. Etapa 2: bytes ao Storage. Etapa 3: registro. */
async function uploadDireto(file: Blob, name: string, type: "image" | "video", folderId?: string | null): Promise<UploadResult> {
  const assinar = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, contentType: file.type, size: file.size }),
  });
  if (!assinar.ok) throw new Error(await mensagemDeErro(assinar));
  const { path, token } = await assinar.json();

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(MEDIA_BUCKET).uploadToSignedUrl(path, token, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(error.message);

  const registrar = await fetch("/api/media/upload-url", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, name, type, sizeKb: Math.ceil(file.size / 1024), folderId: folderId ?? null }),
  });
  if (!registrar.ok) throw new Error(await mensagemDeErro(registrar));
  return { url: (await registrar.json()).url, name };
}

/**
 * Converte qualquer imagem para JPEG com no máximo 1440px de largura.
 *
 * `imageOrientation: "from-image"` respeita o EXIF — sem isso, foto tirada em
 * pé no celular sai deitada, já que o canvas ignora a marcação de rotação.
 * Se algo falhar (formato exótico, sem suporte), devolve o arquivo original e
 * deixa o servidor tentar.
 */
async function paraJpeg(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const escala = Math.min(1, LARGURA_MAX / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Fundo branco: JPEG não tem transparência, e sem isto PNG transparente
    // vira preto.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    if (!blob) return file;
    return new File([blob], trocarExtensao(file.name, "jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function trocarExtensao(name: string, ext: string) {
  return `${name.replace(/\.[^.]+$/, "")}.${ext}`;
}

async function mensagemDeErro(res: Response) {
  const body = await res.json().catch(() => ({}) as { error?: string });
  return body.error || `Falha no upload (${res.status}).`;
}
