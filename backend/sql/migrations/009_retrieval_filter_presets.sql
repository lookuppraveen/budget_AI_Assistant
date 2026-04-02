CREATE TABLE IF NOT EXISTS retrieval_filter_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status_filter TEXT,
  run_type_filter TEXT,
  date_from DATE,
  date_to DATE,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retrieval_filter_presets_created_by ON retrieval_filter_presets(created_by);
CREATE INDEX IF NOT EXISTS idx_retrieval_filter_presets_is_shared ON retrieval_filter_presets(is_shared);

DROP TRIGGER IF EXISTS trg_retrieval_filter_presets_set_updated_at ON retrieval_filter_presets;
CREATE TRIGGER trg_retrieval_filter_presets_set_updated_at
BEFORE UPDATE ON retrieval_filter_presets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
