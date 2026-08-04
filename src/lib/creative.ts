import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Composição do texto sobre o criativo.
 *
 * Modelos de difusão não escrevem texto confiável — em português erram letra na
 * maioria das gerações. Então a IA gera só a FOTO (com espaço negativo
 * reservado) e a copy é desenhada aqui por cima, em SVG: sai exatamente o que
 * foi escrito, na cor exata, sempre legível.
 *
 * O layout NÃO é um template fixo: zona, alinhamento, véu e paleta vêm da
 * direção de arte que o Gemini decide para cada briefing (ver `planCreative`).
 */

import type { CreativePlan, CreativeZone } from "@/lib/ai-types";

/**
 * O fontconfig do runtime da Vercel não tem fontes garantidas, então o app
 * carrega a Inter empacotada em `fonts/`. O arquivo de config é escrito em
 * /tmp porque o caminho absoluto só é conhecido em runtime.
 */
export const FONT_FAMILY = "Inter";

let fontsReady = false;
export function ensureFonts() {
  if (fontsReady || process.env.FONTCONFIG_FILE) return;
  const dir = join(process.cwd(), "fonts");
  const cache = join(tmpdir(), "fontconfig");
  const conf = join(tmpdir(), "postline-fonts.conf");
  try {
    mkdirSync(cache, { recursive: true });
    writeFileSync(conf, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${dir}</dir>
  <cachedir>${cache}</cachedir>
</fontconfig>`);
    process.env.FONTCONFIG_FILE = conf;
  } catch {
    // Sem /tmp gravável, o fontconfig do sistema assume — pior, mas não quebra.
  }
  fontsReady = true;
}

/**
 * Largura aproximada de um texto. O sharp não expõe métricas da fonte, então
 * usa-se uma tabela de avanço por caractere da Inter — precisa o suficiente
 * para quebrar linha e diminuir o corpo até caber, com folga de segurança.
 */
const NARROW = new Set("iljtfrI.,;:'!|()[]{}-/ ");
const WIDE = new Set("mwMW@%—");
function charWidth(char: string) {
  if (NARROW.has(char)) return 0.3;
  if (WIDE.has(char)) return 0.92;
  if (char >= "A" && char <= "Z") return 0.66;
  if (char >= "0" && char <= "9") return 0.6;
  return 0.54;
}
function textWidth(text: string, fontSize: number, bold = false) {
  const base = [...text].reduce((sum, char) => sum + charWidth(char), 0);
  return base * fontSize * (bold ? 1.06 : 1);
}

function wrap(text: string, fontSize: number, maxWidth: number, bold: boolean) {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, fontSize, bold) <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Reduz o corpo até o bloco caber na altura e na largura disponíveis. */
function fitLines(text: string, start: number, min: number, maxWidth: number, maxLines: number, bold: boolean) {
  let size = start;
  let lines = wrap(text, size, maxWidth, bold);
  while (lines.length > maxLines && size > min) {
    size = Math.floor(size * 0.92);
    lines = wrap(text, size, maxWidth, bold);
  }
  return { size, lines: lines.slice(0, maxLines) };
}

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]!);

/** Retângulo em que o texto pode ser desenhado, conforme a zona escolhida. */
function zoneBox(zone: CreativeZone, width: number, height: number) {
  const pad = Math.round(width * 0.07);
  const full = width - pad * 2;
  const half = Math.round(width * 0.52) - pad;
  switch (zone) {
    case "top": return { x: pad, width: full, top: pad, height: Math.round(height * 0.42), anchor: "start" as const };
    case "center": return { x: pad, width: full, top: Math.round(height * 0.3), height: Math.round(height * 0.4), anchor: "middle" as const };
    case "left": return { x: pad, width: half, top: Math.round(height * 0.22), height: Math.round(height * 0.56), anchor: "middle" as const };
    case "right": return { x: width - pad - half, width: half, top: Math.round(height * 0.22), height: Math.round(height * 0.56), anchor: "middle" as const };
    default: return { x: pad, width: full, top: Math.round(height * 0.5), height: Math.round(height * 0.5) - pad, anchor: "end" as const };
  }
}

function scrimShape(plan: CreativePlan, width: number, height: number) {
  const { zone, scrim } = plan.layout;
  if (scrim === "none") return "";
  const color = plan.palette.scrim;
  if (scrim === "solid") {
    const box = zoneBox(zone, width, height);
    const y = zone === "bottom" ? height - box.height - Math.round(height * 0.04) : zone === "top" ? 0 : box.top - Math.round(height * 0.04);
    return `<rect x="0" y="${Math.max(0, y)}" width="${width}" height="${Math.min(height, box.height + Math.round(height * 0.08))}" fill="${color}" opacity="0.82"/>`;
  }
  const direction = zone === "top" ? { x1: 0, y1: 0, x2: 0, y2: 1 } : zone === "left" ? { x1: 0, y1: 0, x2: 1, y2: 0 } : zone === "right" ? { x1: 1, y1: 0, x2: 0, y2: 0 } : { x1: 0, y1: 1, x2: 0, y2: 0 };
  return `<defs><linearGradient id="scrim" x1="${direction.x1}" y1="${direction.y1}" x2="${direction.x2}" y2="${direction.y2}">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.88"/>
      <stop offset="55%" stop-color="${color}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs><rect width="${width}" height="${height}" fill="url(#scrim)"/>`;
}

/** Monta a camada de texto em SVG, do tamanho exato da imagem de fundo. */
export function buildOverlaySvg(plan: CreativePlan, width: number, height: number) {
  const box = zoneBox(plan.layout.zone, width, height);
  const centered = plan.layout.align === "center";
  const anchor = centered ? "middle" : "start";
  const x = centered ? box.x + box.width / 2 : box.x;

  /** Mede o bloco inteiro num dado fator de escala. */
  const measure = (scale: number) => {
    const headline = fitLines(plan.copy.headline, Math.round(width * 0.088 * scale), Math.round(width * 0.038), box.width, 4, true);
    const headlineLeading = Math.round(headline.size * 1.12);
    const subStart = Math.max(Math.round(width * 0.026 * scale), Math.round(headline.size * 0.4));
    const sub = plan.copy.subheadline
      ? fitLines(plan.copy.subheadline, subStart, Math.round(width * 0.02), box.width, 3, false)
      : { size: subStart, lines: [] as string[] };
    const subLeading = Math.round(sub.size * 1.35);
    const ctaSize = Math.round(width * 0.03 * scale);
    const ctaHeight = ctaSize + Math.round(ctaSize * 0.72) * 2;
    const ctaWidth = Math.round(textWidth(plan.copy.cta, ctaSize, true) + Math.round(ctaSize * 1.15) * 2);
    const gapSub = sub.lines.length ? Math.round(headline.size * 0.5) : 0;
    const gapCta = plan.copy.cta ? Math.round(headline.size * 0.62) : 0;
    const blockHeight =
      headline.lines.length * headlineLeading +
      gapSub + sub.lines.length * subLeading +
      gapCta + (plan.copy.cta ? ctaHeight : 0);
    return { headline, headlineLeading, sub, subLeading, ctaSize, ctaHeight, ctaWidth, gapSub, gapCta, blockHeight };
  };

  // Encolhe até o bloco caber na zona — sem isto, uma copy longa numa zona
  // estreita (left/right) transborda e o CTA sai cortado fora da imagem.
  let scale = 1;
  let block = measure(scale);
  while (block.blockHeight > box.height && scale > 0.55) {
    scale *= 0.92;
    block = measure(scale);
  }
  const { headline, headlineLeading, sub, subLeading, ctaSize, ctaHeight, ctaWidth, gapSub, gapCta, blockHeight } = block;

  // Ancora o bloco dentro da zona: no topo, no meio ou colado embaixo, e nunca
  // deixa passar da borda da imagem.
  const raw = box.anchor === "start" ? box.top
    : box.anchor === "middle" ? box.top + Math.max(0, (box.height - blockHeight) / 2)
    : box.top + Math.max(0, box.height - blockHeight);
  const margin = Math.round(height * 0.045);
  const startY = Math.max(margin, Math.min(raw, height - margin - blockHeight));

  const parts: string[] = [scrimShape(plan, width, height)];
  // `y` é sempre o TOPO do próximo elemento; a baseline soma o ascender (~0.8).
  let y = startY;

  headline.lines.forEach((line, index) => {
    const baseline = y + headline.size * 0.8 + index * headlineLeading;
    parts.push(`<text x="${x}" y="${Math.round(baseline)}" text-anchor="${anchor}" font-family="${FONT_FAMILY}" font-size="${headline.size}" font-weight="800" fill="${plan.palette.text}" letter-spacing="${(-headline.size * 0.02).toFixed(2)}">${escapeXml(line)}</text>`);
  });
  y += headline.lines.length * headlineLeading;

  if (sub.lines.length) {
    y += gapSub;
    sub.lines.forEach((line, index) => {
      const baseline = y + sub.size * 0.8 + index * subLeading;
      parts.push(`<text x="${x}" y="${Math.round(baseline)}" text-anchor="${anchor}" font-family="${FONT_FAMILY}" font-size="${sub.size}" font-weight="400" fill="${plan.palette.text}" opacity="0.92">${escapeXml(line)}</text>`);
    });
    y += sub.lines.length * subLeading;
  }

  if (plan.copy.cta) {
    y += gapCta;
    const ctaX = centered ? x - ctaWidth / 2 : x;
    parts.push(`<rect x="${Math.round(ctaX)}" y="${Math.round(y)}" rx="${Math.round(ctaHeight / 2)}" width="${ctaWidth}" height="${ctaHeight}" fill="${plan.palette.accent}"/>`);
    parts.push(`<text x="${Math.round(ctaX + ctaWidth / 2)}" y="${Math.round(y + ctaHeight / 2 + ctaSize * 0.36)}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="${ctaSize}" font-weight="700" fill="${plan.palette.accentText}">${escapeXml(plan.copy.cta)}</text>`);
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

/** Desenha a copy sobre a imagem de fundo e devolve o JPEG final. */
export async function composeCreative(background: Buffer, plan: CreativePlan) {
  ensureFonts();
  const { default: sharp } = await import("sharp");
  const base = sharp(background).rotate();
  const { width, height } = await base.metadata();
  if (!width || !height) throw new Error("Não foi possível ler as dimensões do criativo.");
  const svg = buildOverlaySvg(plan, width, height);
  return base
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90 })
    .toBuffer();
}
