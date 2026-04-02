-- Migration 018: email_sync_events — per-run tracking for email sync jobs
-- Each call to syncEmails() inserts one row so analytics can trend by month.

CREATE TABLE IF NOT EXISTS email_sync_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT        NOT NULL,          -- 'M365' | 'Gmail' | 'SMTP'
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  emails_count        INTEGER     NOT NULL DEFAULT 0,
  attachments_ingested INTEGER    NOT NULL DEFAULT 0,
  month_start         DATE        NOT NULL            -- first day of the calendar month, for easy grouping
);

CREATE INDEX IF NOT EXISTS idx_email_sync_events_month ON email_sync_events (month_start);
CREATE INDEX IF NOT EXISTS idx_email_sync_events_provider ON email_sync_events (provider, month_start);
