/**
 * Aplica as migrations pendentes.
 *
 * Substitui o `drizzle-kit migrate` no build da Vercel porque o spinner dele
 * sobrescreve a mensagem de erro com retornos de carro — o build falhava
 * mostrando só "applying migrations..." seguido de ELIFECYCLE, sem causa.
 *
 * Imprime diagnóstico antes de aplicar: host do banco, migrations já
 * registradas e se as tabelas principais existem. Nada de credencial no log.
 */
import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente");

  const pool = new Pool({ connectionString: url });

  console.log("[migrate] host:", new URL(url).host);

  const { rows: applied } = await pool.query<{ count: string }>(
    `select count(*)::text as count from information_schema.tables
     where table_schema = 'drizzle' and table_name = '__drizzle_migrations'`
  );
  const hasJournal = applied[0]?.count !== "0";
  console.log("[migrate] tabela de migrations:", hasJournal ? "existe" : "AUSENTE");

  if (hasJournal) {
    const { rows } = await pool.query<{ count: string }>(
      "select count(*)::text as count from drizzle.__drizzle_migrations"
    );
    console.log("[migrate] migrations registradas:", rows[0]?.count);
  }

  const { rows: tables } = await pool.query<{ count: string }>(
    `select count(*)::text as count from information_schema.tables
     where table_schema = 'public' and table_name in ('users', 'posts', 'direct_automations')`
  );
  console.log("[migrate] tabelas principais presentes:", tables[0]?.count, "de 3");

  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("[migrate] concluído sem pendências");

  await pool.end();
}

main().catch((error) => {
  console.error("[migrate] FALHOU:", error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exit(1);
});
