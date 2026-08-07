/**
 * Gera `public/icons/badge-96.png`, o ícone pequeno que o Android mostra na
 * barra de status das notificações.
 *
 * O badge é renderizado como **máscara de alfa**: o sistema descarta as cores e
 * pinta de branco tudo que for opaco. Por isso não dá para reusar o icon-192,
 * que é opaco de ponta a ponta e viraria um quadrado sólido. Aqui só a silhueta
 * do "P" sobrevive, que é o que se quer.
 *
 * Rodar após qualquer mudança na logo:  npx tsx scripts/gen-badge.ts
 */
import sharp from "sharp";

const ORIGEM = "public/postline-logo.svg";
const DESTINO = "public/icons/badge-96.png";
const TAMANHO = 96;

async function main() {
  const render = await sharp(ORIGEM)
    .resize({ width: TAMANHO, height: TAMANHO, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Só o canal alfa interessa; o RGB vira branco sólido.
  const alfa = await sharp(render).extractChannel(3).toBuffer();

  await sharp({ create: { width: TAMANHO, height: TAMANHO, channels: 3, background: "#ffffff" } })
    .joinChannel(alfa)
    .png()
    .toFile(DESTINO);

  console.log(`badge gerado: ${DESTINO} (${TAMANHO}x${TAMANHO})`);
}

main();
