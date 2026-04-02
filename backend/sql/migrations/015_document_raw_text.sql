ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS raw_text TEXT,
  ADD COLUMN IF NOT EXISTS char_count INTEGER GENERATED ALWAYS AS (length(raw_text)) STORED;

COMMENT ON COLUMN knowledge_documents.raw_text IS 'Extracted plain text from uploaded file; used for chunking and vector indexing.';
