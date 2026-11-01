/**
 * Grupos de fotos da vitrine da tela de login (lado direito, desktop).
 * Cada grupo tem 6 fotos e um tema; a vitrine troca de grupo a cada 6 s.
 * Arquivos em /public/login — fotos do Unsplash (licença livre), já reduzidas
 * e convertidas para WebP por scripts/build-login-photos.ts.
 */
const THEMES = [
  "agencia",
  "criadores",
  "gastronomia",
  "moda",
  "fitness",
  "viagem",
  "beleza",
  "cafes",
  "pessoas",
  "lifestyle",
  "estrategia",
  "retratos",
] as const;

export const LOGIN_PHOTO_GROUPS: string[][] = THEMES.map((theme) =>
  Array.from({ length: 6 }, (_, i) => `/login/${theme}-${i + 1}.webp`)
);
