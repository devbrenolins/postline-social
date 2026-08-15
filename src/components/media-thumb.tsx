"use client";

/** Extensões que o bucket aceita como vídeo (ver `allowed_mime_types`). */
const VIDEO_RE = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

export function isVideoUrl(url?: string | null) {
  return Boolean(url && VIDEO_RE.test(url));
}

/**
 * Miniatura de mídia que também funciona para vídeo.
 *
 * Vídeo dentro de `<img>` não renderiza nada — era por isso que todo mp4
 * enviado aparecia como quadro vazio na biblioteca, no calendário e nas
 * pré-visualizações. Aqui um `<video>` toma o lugar quando a URL é de vídeo:
 * `preload="metadata"` baixa só o cabeçalho e o fragmento `#t=0.1` força o
 * navegador a pintar um quadro em vez do retângulo preto (o primeiro quadro
 * costuma ser preto, e sem o fragmento nada é decodificado).
 *
 * Sem `controls` por padrão: é miniatura, não player — passe `controls`
 * onde o vídeo é o assunto da tela (a pré-visualização em tamanho grande).
 */
export function MediaThumb({ url, alt = "", className, loading, controls }: { url: string; alt?: string; className?: string; loading?: "lazy" | "eager"; controls?: boolean }) {
  if (isVideoUrl(url)) {
    return (
      <video
        src={`${url}#t=0.1`}
        className={className}
        controls={controls}
        preload={controls ? "auto" : "metadata"}
        muted
        playsInline
        // Silencia o vídeo para leitores de tela: o rótulo já vem do contexto.
        aria-label={alt || undefined}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} loading={loading} />;
}
