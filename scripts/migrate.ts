/**
 * Aplica as migrations pendentes, reconciliando schema que saiu do trilho.
 *
 * Contexto: o banco de produção teve parte do schema criado com `db:push`, que
 * altera as tabelas sem registrar nada no journal. O resultado é um banco cujas
 * colunas já existem mas cujo `drizzle.__drizzle_migrations` está atrás — e aí
 * o migrator normal morre em "column already exists" e trava todo o deploy.
 *
 * Este runner executa statement a statement e tolera **somente** erros de
 * objeto duplicado, tratando-os como "esse pedaço já estava aplicado". Qualquer
 * outro erro derruba o build, como deve ser.
 *
 * Limitação assumida: se uma coluna existir com tipo diferente do que a
 * migration declara, o statement é pulado e a divergência passa. Tolerar
 * duplicata é o preço de destravar um journal dessincronizado; drop e alteração
 * de tipo continuam falhando alto.
 *
 * Os hashes vêm do próprio `readMigrationFiles` do drizzle, então as linhas
 * gravadas aqui são idênticas às que o migrator oficial gravaria — migrations
 * futuras seguem pelo caminho normal.
 */
import { config } from "dotenv";
import { Pool, type PoolClient } from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";

config({ path: ".env.local" });
config();

/** Códigos do Postgres para "esse objeto já existe". */
const ALREADY_EXISTS = new Set([
  "42701", // duplicate_column
  "42P07", // duplicate_table (cobre índice já existente)
  "42710", // duplicate_object (constraint já existente)
  "42P16", // invalid_table_definition (PK duplicada)
]);

function pgCode(error: unknown): string | undefined {
  if (error && typeof error === "object") {
    const direct = (error as { code?: string }).code;
    if (typeof direct === "string") return direct;
    const cause = (error as { cause?: unknown }).cause;
    if (cause) return pgCode(cause);
  }
  return undefined;
}

function detail(error: unknown): string {
  if (error && typeof error === "object") {
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return cause.message;
    if (error instanceof Error) return error.message;
  }
  return String(error);
}

async function ensureJournal(client: PoolClient) {
  await client.query(`create schema if not exists drizzle`);
  await client.query(
    `create table if not exists drizzle.__drizzle_migrations (
       id serial primary key,
       hash text not null,
       created_at bigint
     )`
  );
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente");

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  console.log("[migrate] host:", new URL(url).host);

  try {
    await ensureJournal(client);

    const { rows } = await client.query<{ hash: string }>("select hash from drizzle.__drizzle_migrations");
    const applied = new Set(rows.map((r) => r.hash));
    const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
    const pending = migrations.filter((m) => !applied.has(m.hash));

    console.log(`[migrate] ${applied.size} aplicadas, ${pending.length} pendentes`);
    if (pending.length === 0) {
      console.log("[migrate] nada a fazer");
      return;
    }

    for (const migration of pending) {
      const statements = migration.sql.map((s) => s.trim()).filter(Boolean);
      let ran = 0;
      let skipped = 0;

      await client.query("begin");
      try {
        for (const statement of statements) {
          try {
            await client.query("savepoint stmt");
            await client.query(statement);
            await client.query("release savepoint stmt");
            ran += 1;
          } catch (error) {
            const code = pgCode(error);
            if (!code || !ALREADY_EXISTS.has(code)) throw error;
            await client.query("rollback to savepoint stmt");
            skipped += 1;
            console.log(`[migrate]   já existia (${code}): ${statement.split("\n")[0].slice(0, 90)}`);
          }
        }
        await client.query("insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)", [
          migration.hash,
          migration.folderMillis,
        ]);
        await client.query("commit");
        console.log(`[migrate] ${migration.hash.slice(0, 8)}: ${ran} aplicados, ${skipped} já existiam`);
      } catch (error) {
        await client.query("rollback");
        console.error(`[migrate] FALHOU em ${migration.hash.slice(0, 8)}:`, detail(error));
        throw error;
      }
    }

    console.log("[migrate] concluído");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[migrate] ERRO:", detail(error));
  process.exit(1);
});
