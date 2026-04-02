import { pool } from "../src/config/db.js";

async function run() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query("CREATE EXTENSION IF NOT EXISTS vector");

    await client.query(
      "ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_vector vector(1536)"
    );

    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_vector ON knowledge_chunks USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100)"
    );

    await client.query("COMMIT");
    console.log("pgvector enablement complete.");
    console.log("Next step: run `npm run reindex` to populate embedding_vector.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("pgvector enablement failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
