/**
 * Converte as fotos brutas (JPEG baixadas do Unsplash) em WebP leve para a
 * vitrine do login: 560×747 (3:4), qualidade 74.
 *   pnpm tsx scripts/build-login-photos.ts <pasta-com-os-jpgs>
 * Cada arquivo de entrada se chama <tema>-<n>.jpg (ver src/lib/login-photos.ts).
 */
import sharp from "sharp";
import { mkdirSync, readdirSync } from "node:fs";

const src = process.argv[2];
if (!src) throw new Error("Informe a pasta com os JPEGs.");
mkdirSync("public/login", { recursive: true });

async function main() {
  for (const f of readdirSync(src).filter((n) => n.endsWith(".jpg"))) {
    await sharp(`${src}/${f}`)
      .resize(560, 747, { fit: "cover" })
      .webp({ quality: 74 })
      .toFile(`public/login/${f.replace(/\.jpg$/, ".webp")}`);
  }
  console.log("ok");
}
main();
