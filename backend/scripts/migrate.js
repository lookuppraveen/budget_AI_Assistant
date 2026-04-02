import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "..", "sql", "migrations");

async function run() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationFiles = (await fs.readdir(migrationsDir))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();

    for (const filename of migrationFiles) {
      const alreadyRan = await client.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [filename]);

      if (alreadyRan.rowCount > 0) {
        continue;
      }

      const sql = (await fs.readFile(path.join(migrationsDir, filename), "utf8")).replace(/^\uFEFF/, "");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      console.log(`Migrated: ${filename}`);
    }

    await client.query("COMMIT");
    console.log("Migrations complete");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
