CREATE TABLE IF NOT EXISTS manual_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  report_type  TEXT NOT NULL,
  filters      JSONB NOT NULL DEFAULT '{}',
  content      TEXT,
  status       TEXT NOT NULL DEFAULT 'Generating'
                 CHECK (status IN ('Generating', 'Ready', 'Failed')),
  format       TEXT NOT NULL DEFAULT 'txt'
                 CHECK (format IN ('txt', 'docx')),
  word_count   INTEGER,
  sources_used INTEGER NOT NULL DEFAULT 0,
  error_msg    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_reports_user_id   ON manual_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_reports_status    ON manual_reports(status);
CREATE INDEX IF NOT EXISTS idx_manual_reports_created   ON manual_reports(created_at DESC);
