import { indexAllApprovedDocuments } from "../src/modules/retrieval/retrieval.service.js";
import { pool } from "../src/config/db.js";

async function run() {
  try {
    const result = await indexAllApprovedDocuments();
    console.log(`Knowledge reindex complete. Indexed documents: ${result.indexedDocuments}.`);
    console.log(`Embedding provider: ${result.provider}.`);
    console.log(`Embedding dimensions: ${result.dimensions}.`);
    console.log(`Vector SQL search enabled: ${result.vectorSearchEnabled ? "yes" : "no"}.`);
  } catch (error) {
    console.error("Knowledge reindex failed", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
