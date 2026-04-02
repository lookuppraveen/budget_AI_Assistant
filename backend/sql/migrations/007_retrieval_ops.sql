CREATE TABLE IF NOT EXISTS retrieval_scheduler_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  interval_minutes INTEGER NOT NULL DEFAULT 60 CHECK (interval_minutes BETWEEN 5 AND 1440),
  status TEXT NOT NULL DEFAULT 'idle',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_run_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_retrieval_scheduler_singleton CHECK (id = 1)
);

INSERT INTO retrieval_scheduler_config (id, enabled, interval_minutes, status, next_run_at)
VALUES (1, FALSE, 60, 'idle', now() + INTERVAL '60 minutes')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_retrieval_scheduler_set_updated_at ON retrieval_scheduler_config;
CREATE TRIGGER trg_retrieval_scheduler_set_updated_at
BEFORE UPDATE ON retrieval_scheduler_config
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
