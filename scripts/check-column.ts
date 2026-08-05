/**
 * Confere se a coluna `post_id` existe no banco apontado por DATABASE_URL.
 * Uso: `pnpm tsx scripts/check-column.ts`
 */
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente");

  const client = new Client({ connectionString: url });
  await client.connect();

  const { rows: db } = await client.query("select current_database() as db, current_user as usr");
  const { rows: cols } = await client.query(
    `select column_name from information_schema.columns
     where table_name = 'direct_automations' and column_name = 'post_id'`
  );

  console.log("host     :", new URL(url).host);
  console.log("database :", db[0].db, "| user:", db[0].usr);
  console.log("post_id  :", cols.length ? "EXISTE" : "NAO EXISTE");

  await client.end();
}

main().catch((e) => {
  console.error("FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
