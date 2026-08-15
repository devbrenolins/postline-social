/**
 * Normaliza os extras de publicação vindos do composer (local, colaboradores,
 * texto alternativo, capa do reel). Campo fora de formato derruba a criação do
 * container inteiro na Meta, então nada entra sem forma.
 */
const clamp = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 1 ? v : 0.5);

export function sanitizePublishOptions(input: unknown) {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : undefined;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  // Marcação de perfil na imagem: a Meta exige posição relativa entre 0 e 1.
  const userTags = Array.isArray(raw.userTags)
    ? raw.userTags
        .filter((t): t is { username: string; x?: number; y?: number } => Boolean(t) && typeof (t as { username?: unknown }).username === "string")
        .map((t) => ({
          username: t.username.replace(/^@/, "").trim(),
          x: clamp(t.x),
          y: clamp(t.y),
        }))
        .filter((t) => t.username !== "")
    : undefined;

  return {
    locationId: text(raw.locationId),
    collaborators: list(raw.collaborators)?.map((c) => c.replace(/^@/, "")),
    userTags,
    altTexts: list(raw.altTexts),
    coverUrl: text(raw.coverUrl),
    thumbOffset: typeof raw.thumbOffset === "number" ? raw.thumbOffset : undefined,
    shareToFeed: typeof raw.shareToFeed === "boolean" ? raw.shareToFeed : undefined,
    tiktok: sanitizeTikTok(raw.tiktok),
  };
}

const PRIVACIDADES = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];

/**
 * Opções que o TikTok exige que venham do usuário, não do app: a privacidade
 * escolhida explicitamente e a declaração de conteúdo comercial.
 */
function sanitizeTikTok(input: unknown) {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const privacyLevel = typeof raw.privacyLevel === "string" && PRIVACIDADES.includes(raw.privacyLevel) ? raw.privacyLevel : undefined;
  return {
    privacyLevel,
    brandOrganic: raw.brandOrganic === true,
    brandedContent: raw.brandedContent === true,
  };
}
