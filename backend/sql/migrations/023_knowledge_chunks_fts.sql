-- Add tsvector column for full-text / keyword search
ALTER TABLE knowledge_chunks
ADD COLUMN IF NOT EXISTS content_tsv tsvector;

-- Backfill existing rows
UPDATE knowledge_chunks SET content_tsv = to_tsvector('english', content)
WHERE content_tsv IS NULL;

-- GIN index for fast full-text queries
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_tsv
ON knowledge_chunks USING gin(content_tsv);

-- Auto-update tsvector on INSERT / UPDATE
CREATE OR REPLACE FUNCTION knowledge_chunks_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_chunks_tsv ON knowledge_chunks;
CREATE TRIGGER trg_knowledge_chunks_tsv
BEFORE INSERT OR UPDATE OF content ON knowledge_chunks
FOR EACH ROW
EXECUTE FUNCTION knowledge_chunks_tsv_trigger();
