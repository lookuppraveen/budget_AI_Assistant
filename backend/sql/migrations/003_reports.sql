CREATE TABLE IF NOT EXISTS report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  frequency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Ready', 'Draft', 'Scheduled', 'Failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_report_runs_name_owner_frequency UNIQUE (report_name, owner, frequency)
);

CREATE INDEX IF NOT EXISTS idx_report_runs_status ON report_runs(status);

DROP TRIGGER IF EXISTS trg_report_runs_set_updated_at ON report_runs;
CREATE TRIGGER trg_report_runs_set_updated_at
BEFORE UPDATE ON report_runs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();