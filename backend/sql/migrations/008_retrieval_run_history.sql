CREATE TABLE IF NOT EXISTS retrieval_run_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger TEXT NOT NULL,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  provider TEXT,
  embedding_dimensions INTEGER,
  indexed_documents INTEGER,
  vector_search_enabled BOOLEAN,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_retrieval_run_history_started_at ON retrieval_run_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_retrieval_run_history_status ON retrieval_run_history(status);
