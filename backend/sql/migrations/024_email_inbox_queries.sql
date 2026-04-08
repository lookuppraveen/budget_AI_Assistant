-- Tracks inbound email queries processed by the Budget Agent responder.
-- Each row = one email received, with the extracted query and the agent's reply.
-- Used for deduplication (via external_message_id) and audit/analytics.

CREATE TABLE IF NOT EXISTS email_inbox_queries (
  id                   SERIAL PRIMARY KEY,

  -- Unique identifier from the mail provider (Message-ID header or Graph API id).
  -- Used to prevent processing the same email twice.
  external_message_id  TEXT NOT NULL UNIQUE,

  -- Who sent the email — the Budget Agent will reply to this address.
  sender_email         TEXT NOT NULL,
  sender_name          TEXT,

  -- The original email subject line (used as reply subject prefix).
  subject              TEXT,

  -- The plain-text body extracted from the email (the user's query).
  query_text           TEXT NOT NULL,

  -- The AI-generated response that was sent back.
  response_text        TEXT,

  -- Lifecycle status:
  --   'pending'   — received but not yet replied to
  --   'replied'   — reply email sent successfully
  --   'failed'    — error during processing or sending
  --   'skipped'   — auto-reply / out-of-office / bounce detected; no reply sent
  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'replied', 'failed', 'skipped')),

  -- Error detail when status = 'failed'
  error_message        TEXT,

  -- When the email was received (from mail provider metadata)
  received_at          TIMESTAMPTZ,

  -- When the reply was sent
  replied_at           TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups by sender for analytics and rate-limiting
CREATE INDEX IF NOT EXISTS idx_email_inbox_queries_sender
  ON email_inbox_queries (sender_email);

-- Fast lookups by status for the polling loop (find 'pending' rows on restart)
CREATE INDEX IF NOT EXISTS idx_email_inbox_queries_status
  ON email_inbox_queries (status);

-- Chronological ordering for the admin dashboard
CREATE INDEX IF NOT EXISTS idx_email_inbox_queries_created
  ON email_inbox_queries (created_at DESC);
