/**
 * Diagnóstico de Web Push: confere as chaves e tenta entregar uma notificação
 * em cada inscrição do banco, imprimindo o código HTTP e o corpo do erro.
 *
 * É o caminho mais direto para separar as causas: chave errada, inscrição
 * morta, ou problema de um push service específico (Apple x FCM).
 *
 * ATENÇÃO: envia notificação de verdade para os aparelhos inscritos.
 *
 *   npx tsx scripts/push-diagnose.ts
 */
import { config } from "dotenv";
import { Pool } from "pg";
import webpush from "web-push";

config({ path: ".env.local" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const pubClient = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  if (!pub || !priv) {
    console.error("Faltam VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no ambiente.");
    process.exit(1);
  }
  // Divergência aqui faz o navegador se inscrever com uma chave e o servidor
  // assinar com outra — o push service recusa com 403.
  console.log("chave pública do servidor == a do cliente?", pub === pubClient);
  console.log("subject:", subject ?? "(padrão)");

  webpush.setVapidDetails(subject || "mailto:contato@postline.social", pub, priv);

  const { rows } = await pool.query(
    "select endpoint, p256dh, auth, substring(coalesce(user_agent,'?') from 1 for 40) as ua from push_subscriptions"
  );
  console.log(`\n${rows.length} inscrição(ões) no banco\n`);

  for (const r of rows) {
    const servico = new URL(r.endpoint).host;
    try {
      const res = await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        JSON.stringify({ title: "Diagnóstico", body: "Envio direto do script.", url: "/dashboard", kind: "info" }),
        { TTL: 60 }
      );
      console.log(`OK   ${servico} (${r.ua}) → HTTP ${res.statusCode}`);
    } catch (e) {
      const err = e as { statusCode?: number; body?: string; message?: string };
      console.log(`FALHA ${servico} (${r.ua}) → HTTP ${err.statusCode ?? "?"}`);
      console.log(`      ${(err.body ?? err.message ?? "").toString().slice(0, 300)}`);
    }
  }
  await pool.end();
}
main();
