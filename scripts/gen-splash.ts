/**
 * Gera as imagens de abertura do iPhone (apple-touch-startup-image).
 *
 * O iOS só mostra algo ao abrir um PWA se houver uma imagem com a resolução
 * EXATA do aparelho; sem ela fica a tela preta/branca até o HTML chegar.
 *   pnpm tsx scripts/gen-splash.ts   → grava em public/splash/
 * Mantenha a lista em sincronia com `src/lib/splash-images.ts`.
 */
import sharp from "sharp";
import { mkdirSync, readFileSync } from "node:fs";
import { SPLASH_IMAGES } from "../src/lib/splash-images";

const BG = "#0c0c0e";
const logo = readFileSync("public/icons/icon.svg");

mkdirSync("public/splash", { recursive: true });

async function main() {
  for (const d of SPLASH_IMAGES) {
    const w = d.width * d.ratio;
    const h = d.height * d.ratio;
    const size = Math.round(w * 0.26);
    const mark = await sharp(logo, { density: 300 }).resize({ width: size }).png().toBuffer();
    await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
      .composite([{ input: mark, gravity: "center" }])
      .png({ compressionLevel: 9 })
      .toFile(`public/splash/${w}x${h}.png`);
    console.log(`public/splash/${w}x${h}.png`);
  }
}
main();
