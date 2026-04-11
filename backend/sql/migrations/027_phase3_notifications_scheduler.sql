-- ── Phase 3: Notification Log + Scheduled Reports ─────────────────────────

-- Tracks every email notification sent for budget request lifecycle events
CREATE TABLE IF NOT EXISTS budget_notification_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        UUID        REFERENCES budget_requests(id) ON DELETE CASCADE,
  notification_type TEXT        NOT NULL,  -- submitted | approved | denied | on_hold | under_review
  recipient_email   TEXT        NOT NULL,
  success           BOOLEAN     NOT NULL DEFAULT true,
  error_message     TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_log_request ON budget_notification_log(request_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_sent    ON budget_notification_log(sent_at DESC);

-- Scheduled report configurations
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  report_type TEXT        NOT NULL CHECK (report_type IN ('budget_summary','request_pipeline','anomaly_report','forecast')),
  frequency   TEXT        NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  recipients  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  filters     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_status TEXT        CHECK (last_status IN ('success','failed','pending')),
  last_error  TEXT,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run ON scheduled_reports(next_run_at) WHERE is_active = true;
