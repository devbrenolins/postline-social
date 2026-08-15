/**
 * Hospeda um arquivo de verificação de posse de URL na raiz do bucket público
 * de mídias.
 *
 * O TikTok (e outras plataformas que verificam posse por prefixo de URL) pede
 * um arquivo de assinatura acessível exatamente sob o prefixo cadastrado. Como
 * nossas mídias moram no Supabase Storage, o prefixo é o do bucket — e não o
 * domínio do app, que não é nosso para verificar por DNS.
 *
 * São dois destinos possíveis, porque são duas propriedades diferentes:
 *   - bucket de mídias (padrão) → prefixo usado pelo `PULL_FROM_URL`
 *   - pasta `public/` (`--app`) → prefixo do próprio site (termos, privacidade)
 *
 * Uso:
 *   npx tsx scripts/host-verification-file.ts <caminho-do-arquivo-baixado>
 *   npx tsx scripts/host-verification-file.ts <caminho-do-arquivo> --app
 *   npx tsx scripts/host-verification-file.ts <nome-remoto> <conteúdo>
 *
 * Preferir o caminho do arquivo: sobe os bytes exatos, sem risco de perder ou
 * acrescentar quebra de linha na passagem pelo shell — o que faria a
 * verificação falhar com o conteúdo "quase" certo.
 *
 * Passe `--delete` no lugar do conteúdo para remover o arquivo depois.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { config } from "dotenv";
config({ path: ".env.local" });

const BUCKET = "media";

async function main() {
  const [alvo, segundo] = process.argv.slice(2);
  if (!alvo) {
    console.error("Informe o arquivo baixado da plataforma. Ex.: npx tsx scripts/host-verification-file.ts ~/Downloads/tiktokABC.txt");
    process.exit(1);
  }

  const noApp = process.argv.includes("--app");

  // Caminho de arquivo local: nome remoto e conteúdo saem dele.
  const local = segundo !== "--delete" && existsSync(alvo) ? alvo : null;
  const name = local ? basename(local) : alvo;
  const content = local ? readFileSync(local, "utf8") : segundo;
  if (local) console.log(`lendo ${local} (${readFileSync(local).length} bytes)`);

  if (noApp) return hospedarNoApp(name, content, alvo);

  const { createSupabaseAdminClient } = await import("../src/lib/supabase/admin");
  const supabase = createSupabaseAdminClient();
  const remover = content === "--delete";

  if (remover) {
    const { error } = await supabase.storage.from(BUCKET).remove([name]);
    if (error) throw new Error(error.message);
    console.log(`removido: ${name}`);
    process.exit(0);
  }

  if (!content) {
    console.error("Informe o caminho do arquivo baixado ou o conteúdo dele.");
    process.exit(1);
  }

  // O bucket de mídias restringe os tipos aceitos a imagem e vídeo — proteção
  // que vale manter. Acrescentamos text/plain à lista (sem remover nada) para
  // caber o arquivo de verificação.
  await permitirTextoPuro(supabase);

  const { error } = await supabase.storage.from(BUCKET).upload(name, Buffer.from(content, "utf8"), {
    contentType: "text/plain",
    upsert: true,
  });
  if (error) throw new Error(`Falha ao enviar: ${error.message}`);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(name);
  const url = pub.publicUrl;
  console.log("enviado:", url);

  // Confere do jeito que a plataforma vai conferir: precisa vir 200, sem
  // redirecionamento, com o conteúdo exato.
  const res = await fetch(url, { redirect: "manual", cache: "no-store" });
  const body = await res.text();
  console.log("status:", res.status, "| redirecionou:", res.status >= 300 && res.status < 400 ? "SIM (inválido)" : "não");
  // Comparação exata: a plataforma compara os bytes, não a versão aparada.
  console.log("conteúdo confere:", body === content ? "sim (byte a byte)" : body.trim() === content.trim() ? "sim (ignorando espaços nas pontas)" : `NÃO (recebido: ${body.slice(0, 80)})`);
  console.log("\nPrefixo a cadastrar na plataforma:");
  console.log(url.slice(0, url.lastIndexOf("/") + 1));
  process.exit(0);
}

/**
 * Coloca o arquivo em `public/`, servido pelo próprio site.
 *
 * Diferente do bucket, aqui **não vale na hora**: só depois do deploy. O
 * middleware deixa passar porque trata qualquer caminho com extensão como
 * estático, então o arquivo responde 200 sem redirecionamento.
 */
function hospedarNoApp(name: string, content: string, origem: string): void {
  const destino = join(process.cwd(), "public", name);
  writeFileSync(destino, content, "utf8");
  console.log(`copiado: ${origem} → public/${name}`);

  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  console.log(`\nURL depois do deploy:\n  ${base}/${name}`);
  console.log(`\nPrefixo a cadastrar na plataforma:\n  ${base}/`);
  console.log("\n⚠ Só funciona depois de commitar e fazer deploy — o arquivo é servido pelo build.");
  process.exit(0);
}

/** Garante `text/plain` na lista de tipos aceitos do bucket, preservando o resto. */
async function permitirTextoPuro(supabase: SupabaseClient) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  const atuais = data?.allowed_mime_types ?? null;
  // Lista nula = bucket sem restrição; não há o que ajustar.
  if (!atuais || atuais.includes("text/plain")) return;

  // `public` é obrigatório no update e sobrescreve o valor atual — repassamos o
  // que já estava para não tornar o bucket privado sem querer.
  const { error } = await supabase.storage.updateBucket(BUCKET, {
    public: data?.public ?? true,
    allowedMimeTypes: [...atuais, "text/plain"],
  });
  if (error) throw new Error(`Não foi possível liberar text/plain no bucket: ${error.message}`);
  console.log("bucket ajustado: text/plain acrescentado aos tipos aceitos");
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
