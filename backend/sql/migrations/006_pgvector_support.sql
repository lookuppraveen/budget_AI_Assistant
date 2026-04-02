DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension is not available: %', SQLERRM;
END
$$;

ALTER TABLE knowledge_chunks
ADD COLUMN IF NOT EXISTS embedding_model TEXT,
ADD COLUMN IF NOT EXISTS embedding_provider TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_vector vector(1536)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_vector ON knowledge_chunks USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100)';
  END IF;
END
$$;
