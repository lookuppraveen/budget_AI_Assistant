CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding DOUBLE PRECISION[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_knowledge_chunks_document_chunk UNIQUE (document_id, chunk_index),
  CONSTRAINT chk_knowledge_chunks_token_count CHECK (token_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id ON knowledge_chunks(document_id);

DROP TRIGGER IF EXISTS trg_knowledge_chunks_set_updated_at ON knowledge_chunks;
CREATE TRIGGER trg_knowledge_chunks_set_updated_at
BEFORE UPDATE ON knowledge_chunks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
