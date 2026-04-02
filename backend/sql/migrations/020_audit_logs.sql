-- Migration 020: Comprehensive audit log for user actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  user_email   TEXT,
  user_role    TEXT,
  action       TEXT        NOT NULL,       -- e.g. 'user.login', 'document.approved'
  entity_type  TEXT,                       -- e.g. 'document', 'user', 'report'
  entity_id    TEXT,
  details      JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user     ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action   ON audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity   ON audit_logs (entity_type, entity_id);
