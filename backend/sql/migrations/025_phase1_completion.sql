-- Phase 1 Completion Migration
-- Adds: Cabinet & Board Summary roles, conversation budget context,
--       human review queue, domain enforcement list

-- ── 1. New roles ─────────────────────────────────────────────────────────────
INSERT INTO roles (name, is_active)
VALUES
  ('Cabinet', true),
  ('Board Summary', true)
ON CONFLICT (name) DO NOTHING;

-- ── 2. Permissions for new roles ─────────────────────────────────────────────
-- Cabinet: can view chat, reports, manual reports, audit (read-only leadership view)
-- Board Summary: can view chat and manual reports only (narrowest executive view)
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM roles r
JOIN (VALUES
  ('Cabinet',       'Reports'),
  ('Cabinet',       'Audit'),
  ('Cabinet',       'Documents'),
  ('Board Summary', 'Reports')
) AS p(role_name, permission_key)
  ON p.role_name = r.name
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ── 3. Budget context on conversations ───────────────────────────────────────
-- Stores active department, fund type, fiscal year, and topic for scoped answers
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS budget_context JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── 4. Human review queue ─────────────────────────────────────────────────────
-- Created when AI confidence < threshold; budget office staff review these
CREATE TABLE IF NOT EXISTS human_review_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  user_message_id   UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  assistant_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,

  -- The original question that triggered low confidence
  user_query        TEXT NOT NULL,

  -- The AI response that was low-confidence
  ai_response       TEXT,

  -- Confidence score that triggered the escalation (0.0 – 1.0)
  confidence_score  NUMERIC(5,4),

  -- Top citation title that was used (if any)
  top_citation      TEXT,

  -- Lifecycle:
  --   'pending'   — needs budget office review
  --   'reviewed'  — reviewed, no action needed
  --   'resolved'  — resolved with a corrective answer or document update
  --   'dismissed' — triaged and dismissed
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),

  -- Staff notes added during review
  reviewer_notes    TEXT,

  -- Who reviewed it
  reviewed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hrq_status          ON human_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_hrq_created_at      ON human_review_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hrq_user_id         ON human_review_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_hrq_conversation_id ON human_review_queue(conversation_id);

DROP TRIGGER IF EXISTS trg_hrq_set_updated_at ON human_review_queue;
CREATE TRIGGER trg_hrq_set_updated_at
BEFORE UPDATE ON human_review_queue
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
