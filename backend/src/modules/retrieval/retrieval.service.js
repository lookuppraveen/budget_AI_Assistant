import OpenAI from "openai";
import { pool } from "../../config/db.js";
import { env } from "../../config/env.js";

const LOCAL_EMBEDDING_DIMENSIONS = 128;
const CHUNK_SIZE_WORDS = 90;
const CHUNK_OVERLAP_WORDS = 18;

let openAiClient = null;
let pgvectorReadyCache = null;
let schedulerTimer = null;

async function createRunHistoryStart({ trigger, runType, metadata }) {
  const result = await pool.query(
    `INSERT INTO retrieval_run_history (trigger, run_type, status, started_at, metadata)
     VALUES ($1, $2, 'success', now(), $3::jsonb)
     RETURNING id, started_at`,
    [trigger, runType, JSON.stringify(metadata || {})]
  );

  return result.rows[0];
}

async function completeRunHistorySuccess(runId, startedAt, payload) {
  const durationMs = Math.max(0, Date.now() - new Date(startedAt).getTime());
  await pool.query(
    `UPDATE retrieval_run_history
     SET status = 'success',
         provider = $1,
         embedding_dimensions = $2,
         indexed_documents = $3,
         vector_search_enabled = $4,
         completed_at = now(),
         duration_ms = $5,
         metadata = $6::jsonb
     WHERE id = $7`,
    [
      payload.provider || null,
      payload.dimensions || null,
      payload.indexedDocuments || 0,
      Boolean(payload.vectorSearchEnabled),
      durationMs,
      JSON.stringify(payload.metadata || {}),
      runId
    ]
  );
}

async function completeRunHistoryError(runId, startedAt, error, metadata) {
  const durationMs = Math.max(0, Date.now() - new Date(startedAt).getTime());
  await pool.query(
    `UPDATE retrieval_run_history
     SET status = 'error',
         error_message = $1,
         completed_at = now(),
         duration_ms = $2,
         metadata = $3::jsonb
     WHERE id = $4`,
    [error?.message || "unknown error", durationMs, JSON.stringify(metadata || {}), runId]
  );
}

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "about",
  "this",
  "that",
  "what",
  "when",
  "where",
  "which",
  "how",
  "can",
  "could",
  "would",
  "should",
  "please",
  "into",
  "onto",
  "have",
  "has",
  "had",
  "are",
  "was",
  "were",
  "budget",
  "department",
  "policy"
]);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((token) => token.length > 1 && !stopWords.has(token));
}

function hashString(value, seed = 0) {
  let hash = 2166136261 ^ seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeVector(values) {
  const norm = Math.sqrt(values.reduce((acc, value) => acc + value * value, 0));
  if (!norm) {
    return values;
  }
  return values.map((value) => value / norm);
}

function localEmbedText(text) {
  const vector = Array.from({ length: LOCAL_EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = tokenize(text);

  if (!tokens.length) {
    return vector;
  }

  for (const token of tokens) {
    const indexA = hashString(token, 13) % LOCAL_EMBEDDING_DIMENSIONS;
    const indexB = hashString(token, 97) % LOCAL_EMBEDDING_DIMENSIONS;
    const sign = (hashString(token, 193) & 1) === 0 ? 1 : -1;
    vector[indexA] += sign * 1;
    vector[indexB] += sign * 0.5;
  }

  return normalizeVector(vector);
}

function cosineSimilarity(vectorA, vectorB) {
  if (!vectorA?.length || !vectorB?.length || vectorA.length !== vectorB.length) {
    return 0;
  }

  let value = 0;
  for (let index = 0; index < vectorA.length; index += 1) {
    value += vectorA[index] * vectorB[index];
  }
  return value;
}

function chunkText(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }

  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE_WORDS, words.length);
    const chunkWords = words.slice(start, end);
    chunks.push(chunkWords.join(" "));

    if (end >= words.length) {
      break;
    }

    start = Math.max(0, end - CHUNK_OVERLAP_WORDS);
  }

  return chunks;
}

function buildDocumentText(document) {
  // If the document has extracted text (from PDF/DOCX/XLSX etc.) use it as the
  // primary content. Prepend the header fields so embeddings carry domain context.
  const header = [
    `Title: ${document.title}`,
    `Domain: ${document.domain}`,
    `Source type: ${document.source_type}`,
    `Department: ${document.department_name}`
  ].join("\n");

  if (document.raw_text && document.raw_text.trim().length > 0) {
    return `${header}\n\n${document.raw_text.trim()}`;
  }

  // Fallback: metadata-only text (for documents created without file extraction)
  const metadataText = typeof document.metadata === "object" ? JSON.stringify(document.metadata) : "";
  return [header, metadataText ? `Metadata: ${metadataText}` : ""].filter(Boolean).join("\n");
}

function getEmbeddingProvider() {
  if (!env.useOpenAiEmbeddings || !env.openAiApiKey) {
    return "local";
  }
  return "openai";
}

function getOpenAiClient() {
  if (!openAiClient) {
    openAiClient = new OpenAI({ apiKey: env.openAiApiKey });
  }
  return openAiClient;
}

function fitVectorDimensions(values, dimensions) {
  const normalized = normalizeVector(values.slice(0, dimensions));
  if (normalized.length === dimensions) {
    return normalized;
  }

  const padded = Array.from({ length: dimensions }, (_, index) => normalized[index] || 0);
  return normalizeVector(padded);
}

function toPgvectorLiteral(values) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

async function isPgvectorReady() {
  if (pgvectorReadyCache !== null) {
    return pgvectorReadyCache;
  }

  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'knowledge_chunks'
         AND column_name = 'embedding_vector'
     ) AS has_vector_column`
  );

  pgvectorReadyCache = Boolean(result.rows[0]?.has_vector_column);
  return pgvectorReadyCache;
}

async function openAiEmbedText(text) {
  const client = getOpenAiClient();
  const response = await client.embeddings.create({
    model: env.openAiEmbeddingModel,
    input: text
  });

  return response.data[0].embedding;
}

async function embedText(text) {
  const provider = getEmbeddingProvider();

  if (provider === "openai") {
    try {
      const vector = await openAiEmbedText(text);
      return {
        vector: fitVectorDimensions(vector, env.embeddingDimensions),
        provider: "openai",
        model: env.openAiEmbeddingModel
      };
    } catch (error) {
      console.warn("OpenAI embeddings failed. Falling back to local embeddings.", error.message);
    }
  }

  return {
    vector: fitVectorDimensions(localEmbedText(text), env.embeddingDimensions),
    provider: "local",
    model: "local-hash-v1"
  };
}

async function insertChunk(client, { documentId, chunkIndex, content, tokenCount, vector, provider, model }) {
  const pgvectorReady = await isPgvectorReady();

  if (pgvectorReady) {
    await client.query(
      `INSERT INTO knowledge_chunks (
         document_id, chunk_index, content, token_count, embedding, embedding_provider, embedding_model, embedding_vector
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
       ON CONFLICT (document_id, chunk_index) DO UPDATE SET
         content = EXCLUDED.content,
         token_count = EXCLUDED.token_count,
         embedding = EXCLUDED.embedding,
         embedding_provider = EXCLUDED.embedding_provider,
         embedding_model = EXCLUDED.embedding_model,
         embedding_vector = EXCLUDED.embedding_vector,
         updated_at = now()`,
      [documentId, chunkIndex, content, tokenCount, vector, provider, model, toPgvectorLiteral(vector)]
    );
    return;
  }

  await client.query(
    `INSERT INTO knowledge_chunks (
       document_id, chunk_index, content, token_count, embedding, embedding_provider, embedding_model
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (document_id, chunk_index) DO UPDATE SET
       content = EXCLUDED.content,
       token_count = EXCLUDED.token_count,
       embedding = EXCLUDED.embedding,
       embedding_provider = EXCLUDED.embedding_provider,
       embedding_model = EXCLUDED.embedding_model,
       updated_at = now()`,
    [documentId, chunkIndex, content, tokenCount, vector, provider, model]
  );
}

export async function indexApprovedDocumentChunks(documentId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const documentResult = await client.query(
      `SELECT kd.id, kd.title, kd.domain, kd.source_type, kd.metadata, kd.status, kd.raw_text,
              d.name AS department_name
       FROM knowledge_documents kd
       JOIN departments d ON d.id = kd.department_id
       WHERE kd.id = $1`,
      [documentId]
    );

    if (documentResult.rowCount === 0) {
      await client.query("COMMIT");
      return { indexed: false, reason: "not_found" };
    }

    const document = documentResult.rows[0];
    await client.query("DELETE FROM knowledge_chunks WHERE document_id = $1", [document.id]);

    if (document.status !== "Approved") {
      await client.query("COMMIT");
      return { indexed: false, reason: "not_approved" };
    }

    const sourceText = buildDocumentText(document);
    const chunks = chunkText(sourceText);

    for (let index = 0; index < chunks.length; index += 1) {
      const content = chunks[index];
      const embedded = await embedText(content);
      const tokenCount = tokenize(content).length;

      await insertChunk(client, {
        documentId: document.id,
        chunkIndex: index,
        content,
        tokenCount,
        vector: embedded.vector,
        provider: embedded.provider,
        model: embedded.model
      });
    }

    await client.query("COMMIT");
    return { indexed: true, chunkCount: chunks.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function indexAllApprovedDocuments() {
  const documents = await pool.query(
    "SELECT id FROM knowledge_documents WHERE status = 'Approved' ORDER BY updated_at DESC LIMIT 200"
  );

  let indexed = 0;

  for (const row of documents.rows) {
    const result = await indexApprovedDocumentChunks(row.id);
    if (result.indexed) {
      indexed += 1;
    }
  }

  return {
    indexedDocuments: indexed,
    provider: getEmbeddingProvider(),
    dimensions: env.embeddingDimensions,
    vectorSearchEnabled: await isPgvectorReady()
  };
}

export async function runDocumentReindexWithHistory(documentId, trigger = "manual-document") {
  const run = await createRunHistoryStart({
    trigger,
    runType: "document",
    metadata: { documentId }
  });

  try {
    const result = await indexApprovedDocumentChunks(documentId);
    await completeRunHistorySuccess(run.id, run.started_at, {
      provider: getEmbeddingProvider(),
      dimensions: env.embeddingDimensions,
      indexedDocuments: result.indexed ? 1 : 0,
      vectorSearchEnabled: await isPgvectorReady(),
      metadata: { documentId, chunkCount: result.chunkCount || 0, indexed: Boolean(result.indexed) }
    });

    return result;
  } catch (error) {
    await completeRunHistoryError(run.id, run.started_at, error, { documentId });
    throw error;
  }
}

export async function listDocumentChunks(documentId) {
  const result = await pool.query(
    `SELECT kc.id, kc.chunk_index, kc.content, kc.token_count, kc.embedding_provider, kc.embedding_model, kc.created_at,
            kd.title AS document_title, kd.domain, kd.source_type, d.name AS department
     FROM knowledge_chunks kc
     JOIN knowledge_documents kd ON kd.id = kc.document_id
     JOIN departments d ON d.id = kd.department_id
     WHERE kc.document_id = $1
     ORDER BY kc.chunk_index ASC`,
    [documentId]
  );

  return result.rows;
}

export async function getRetrievalQualityMetrics() {
  const [totalTurnsResult, assistantTurnsResult, voiceTurnsResult, citationCoverageResult, lowConfidenceResult, topQueriesResult] =
    await Promise.all([
      pool.query("SELECT count(*)::int AS count FROM chat_messages WHERE role = 'user'"),
      pool.query("SELECT count(*)::int AS count FROM chat_messages WHERE role = 'assistant'"),
      pool.query("SELECT count(*)::int AS count FROM chat_messages WHERE source = 'voice'"),
      pool.query(
        `SELECT coalesce(round(100.0 * avg(CASE
                  WHEN role = 'assistant'
                    AND jsonb_typeof(metadata->'citations') = 'array'
                    AND jsonb_array_length(metadata->'citations') > 0
                  THEN 1 ELSE 0 END), 2), 0)::float AS pct
         FROM chat_messages
         WHERE role = 'assistant'`
      ),
      pool.query(
        `SELECT count(*)::int AS count
         FROM chat_messages
         WHERE role = 'assistant'
           AND (
             content ILIKE '%I could not find matching approved knowledge%'
             OR content ILIKE '%I don''t know%'
           )`
      ),
      pool.query(
        `SELECT lower(left(content, 70)) AS query, count(*)::int AS count
         FROM chat_messages
         WHERE role = 'user'
         GROUP BY lower(left(content, 70))
         ORDER BY count(*) DESC
         LIMIT 5`
      )
    ]);

  const totalUserTurns = totalTurnsResult.rows[0]?.count || 0;
  const assistantTurns = assistantTurnsResult.rows[0]?.count || 0;
  const voiceTurns = voiceTurnsResult.rows[0]?.count || 0;
  const citationCoveragePct = citationCoverageResult.rows[0]?.pct || 0;
  const lowConfidenceCount = lowConfidenceResult.rows[0]?.count || 0;

  return {
    totalUserTurns,
    assistantTurns,
    voiceTurns,
    citationCoveragePct,
    lowConfidenceCount,
    lowConfidenceRatePct: assistantTurns ? Number(((lowConfidenceCount / assistantTurns) * 100).toFixed(2)) : 0,
    topQueries: topQueriesResult.rows
  };
}

export async function listRetrievalRuns(limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const result = await pool.query(
    `SELECT id, trigger, run_type, status, provider, embedding_dimensions, indexed_documents,
            vector_search_enabled, error_message, started_at, completed_at, duration_ms, metadata
     FROM retrieval_run_history
     ORDER BY started_at DESC
     LIMIT $1`,
    [safeLimit]
  );

  return result.rows;
}

export async function listRunFilterPresets(userId) {
  const result = await pool.query(
    `SELECT id, name, status_filter, run_type_filter, date_from, date_to, is_shared, created_by, created_at, updated_at
     FROM retrieval_filter_presets
     WHERE is_shared = true OR created_by = $1
     ORDER BY is_shared DESC, updated_at DESC`,
    [userId]
  );

  return result.rows;
}

export async function createRunFilterPreset(userId, role, { name, status, runType, dateFrom, dateTo, isShared }) {
  const safeName = String(name || "").trim();
  if (!safeName) {
    const error = new Error("Preset name is required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedStatus = status && status !== "ALL" ? status : null;
  const normalizedRunType = runType && runType !== "ALL" ? runType : null;
  const normalizedDateFrom = dateFrom ? String(dateFrom) : null;
  const normalizedDateTo = dateTo ? String(dateTo) : null;
  const shared = Boolean(isShared) && role === "Admin";

  const result = await pool.query(
    `INSERT INTO retrieval_filter_presets (
       name, status_filter, run_type_filter, date_from, date_to, is_shared, created_by
     )
     VALUES ($1, $2, $3, $4::date, $5::date, $6, $7)
     RETURNING id, name, status_filter, run_type_filter, date_from, date_to, is_shared, created_by, created_at, updated_at`,
    [safeName, normalizedStatus, normalizedRunType, normalizedDateFrom, normalizedDateTo, shared, userId]
  );

  return result.rows[0];
}

export async function deleteRunFilterPreset(presetId, userId, role) {
  const result = await pool.query(
    `DELETE FROM retrieval_filter_presets
     WHERE id = $1
       AND (created_by = $2 OR $3 = 'Admin')
     RETURNING id`,
    [presetId, userId, role]
  );

  if (result.rowCount === 0) {
    const error = new Error("Preset not found or no permission to delete");
    error.statusCode = 404;
    throw error;
  }

  return { id: result.rows[0].id };
}

async function getSchedulerRow() {
  const result = await pool.query(
    `SELECT enabled, interval_minutes, status, last_run_at, next_run_at, last_run_summary, updated_at
     FROM retrieval_scheduler_config
     WHERE id = 1`
  );

  return result.rows[0];
}

export async function getSchedulerConfig() {
  const row = await getSchedulerRow();

  return {
    enabled: row.enabled,
    intervalMinutes: row.interval_minutes,
    status: row.status,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    lastRunSummary: row.last_run_summary,
    updatedAt: row.updated_at
  };
}

export async function updateSchedulerConfig({ enabled, intervalMinutes }) {
  const result = await pool.query(
    `UPDATE retrieval_scheduler_config
     SET enabled = $1,
         interval_minutes = $2,
         status = CASE WHEN $1 THEN status ELSE 'idle' END,
         next_run_at = CASE WHEN $1 THEN now() + make_interval(mins => $2) ELSE NULL END
     WHERE id = 1
     RETURNING enabled, interval_minutes, status, last_run_at, next_run_at, last_run_summary, updated_at`,
    [enabled, intervalMinutes]
  );

  const row = result.rows[0];
  return {
    enabled: row.enabled,
    intervalMinutes: row.interval_minutes,
    status: row.status,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    lastRunSummary: row.last_run_summary,
    updatedAt: row.updated_at
  };
}

export async function runScheduledReindex(trigger = "manual", runType = "scheduler") {
  const run = await createRunHistoryStart({
    trigger,
    runType,
    metadata: {}
  });

  await pool.query(
    `UPDATE retrieval_scheduler_config
     SET status = 'running'
     WHERE id = 1`
  );

  try {
    const result = await indexAllApprovedDocuments();

    await pool.query(
      `UPDATE retrieval_scheduler_config
       SET status = 'idle',
           last_run_at = now(),
           next_run_at = CASE WHEN enabled THEN now() + make_interval(mins => interval_minutes) ELSE NULL END,
           last_run_summary = $1::jsonb
       WHERE id = 1`,
      [
        JSON.stringify({
          trigger,
          indexedDocuments: result.indexedDocuments,
          provider: result.provider,
          dimensions: result.dimensions,
          vectorSearchEnabled: result.vectorSearchEnabled
        })
      ]
    );

    await completeRunHistorySuccess(run.id, run.started_at, {
      provider: result.provider,
      dimensions: result.dimensions,
      indexedDocuments: result.indexedDocuments,
      vectorSearchEnabled: result.vectorSearchEnabled,
      metadata: { trigger, runType }
    });

    return result;
  } catch (error) {
    await pool.query(
      `UPDATE retrieval_scheduler_config
       SET status = 'error',
           last_run_summary = $1::jsonb
      WHERE id = 1`,
      [JSON.stringify({ trigger, error: error.message })]
    );
    await completeRunHistoryError(run.id, run.started_at, error, { trigger, runType });
    throw error;
  }
}

export function startRetrievalScheduler() {
  if (schedulerTimer) {
    return;
  }

  schedulerTimer = setInterval(async () => {
    try {
      const row = await getSchedulerRow();
      if (!row?.enabled || row.status === "running" || !row.next_run_at) {
        return;
      }

      if (new Date(row.next_run_at).getTime() <= Date.now()) {
        await runScheduledReindex("scheduler", "scheduler");
      }
    } catch (error) {
      console.error("Retrieval scheduler tick failed", error.message);
    }
  }, 60 * 1000);
}

async function searchKnowledgeChunksSql(query, limit, departmentId) {
  const embeddedQuery = await embedText(query);
  const vectorLiteral = toPgvectorLiteral(embeddedQuery.vector);

  const params = [vectorLiteral, limit];
  const deptFilter = departmentId ? `AND kd.department_id = $${params.push(departmentId)}` : "";

  const result = await pool.query(
    `SELECT kc.id, kc.content, kc.embedding,
            kd.id AS document_id, kd.title, kd.domain, kd.source_type,
            d.name AS department,
            (1 - (kc.embedding_vector <=> $1::vector)) AS score
     FROM knowledge_chunks kc
     JOIN knowledge_documents kd ON kd.id = kc.document_id
     JOIN departments d ON d.id = kd.department_id
     WHERE kd.status = 'Approved'
       AND kc.embedding_vector IS NOT NULL
       ${deptFilter}
     ORDER BY kc.embedding_vector <=> $1::vector
     LIMIT $2`,
    params
  );

  return result.rows;
}

async function searchKnowledgeChunksJs(query, limit, departmentId) {
  const embeddedQuery = await embedText(query);

  const params = [];
  const deptFilter = departmentId ? `AND kd.department_id = $${params.push(departmentId)}` : "";

  const result = await pool.query(
    `SELECT kc.id, kc.content, kc.embedding,
            kd.id AS document_id, kd.title, kd.domain, kd.source_type,
            d.name AS department
     FROM knowledge_chunks kc
     JOIN knowledge_documents kd ON kd.id = kc.document_id
     JOIN departments d ON d.id = kd.department_id
     WHERE kd.status = 'Approved'
       ${deptFilter}`,
    params.length ? params : undefined
  );

  return result.rows
    .map((row) => ({
      ...row,
      score: cosineSimilarity(embeddedQuery.vector, row.embedding)
    }))
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function searchKnowledgeChunks(query, limit = 5, departmentId = null) {
  const pgvectorReady = await isPgvectorReady();

  if (pgvectorReady) {
    return searchKnowledgeChunksSql(query, limit, departmentId);
  }

  return searchKnowledgeChunksJs(query, limit, departmentId);
}

export async function getRetrievalHealth() {
  const pgvectorReady = await isPgvectorReady();

  const [documentsResult, chunksResult, providerResult, extensionResult, columnResult, indexResult] = await Promise.all([
    pool.query(
      "SELECT count(*)::int AS approved_documents FROM knowledge_documents WHERE status = 'Approved'"
    ),
    pool.query("SELECT count(*)::int AS total_chunks FROM knowledge_chunks"),
    pool.query(
      `SELECT coalesce(embedding_provider, 'unknown') AS provider,
              coalesce(embedding_model, 'unknown') AS model,
              count(*)::int AS chunk_count
       FROM knowledge_chunks
       GROUP BY coalesce(embedding_provider, 'unknown'), coalesce(embedding_model, 'unknown')
       ORDER BY count(*) DESC`
    ),
    pool.query("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed"),
    pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_name = 'knowledge_chunks'
           AND column_name = 'embedding_vector'
       ) AS exists`
    ),
    pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_indexes
         WHERE tablename = 'knowledge_chunks'
           AND indexname = 'idx_knowledge_chunks_embedding_vector'
       ) AS exists`
    )
  ]);

  const extensionInstalled = Boolean(extensionResult.rows[0]?.installed);
  const vectorColumnExists = Boolean(columnResult.rows[0]?.exists);
  const vectorIndexExists = Boolean(indexResult.rows[0]?.exists);
  const vectorMode = pgvectorReady ? "sql-vector" : "js-fallback";

  return {
    vectorSearchEnabled: pgvectorReady,
    vectorMode,
    extensionInstalled,
    vectorColumnExists,
    vectorIndexExists,
    configuredProvider: getEmbeddingProvider(),
    configuredModel: getEmbeddingProvider() === "openai" ? env.openAiEmbeddingModel : "local-hash-v1",
    embeddingDimensions: env.embeddingDimensions,
    approvedDocuments: documentsResult.rows[0]?.approved_documents || 0,
    totalChunks: chunksResult.rows[0]?.total_chunks || 0,
    indexedProviders: providerResult.rows
  };
}

/**
 * Public knowledge search — wraps searchKnowledgeChunks with optional
 * domain and department filtering applied after retrieval.
 */
export async function searchKnowledge(query, { domain, department, limit = 10 } = {}) {
  const raw = await searchKnowledgeChunks(query, Math.min(Number(limit) || 10, 50));

  let results = raw;

  if (domain) {
    results = results.filter((r) => r.domain === domain);
  }

  if (department) {
    results = results.filter((r) => r.department === department);
  }

  return results.map((r) => ({
    documentId: r.document_id,
    title: r.title,
    domain: r.domain,
    department: r.department,
    sourceType: r.source_type,
    excerpt: r.content.slice(0, 350),
    score: Number(r.score.toFixed(4))
  }));
}
