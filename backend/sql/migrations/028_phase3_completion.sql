-- Phase 3: Scenario Planning, Institutional Memory, Continuous Learning Loop
-- Tables: budget_scenarios, decision_log, chat_feedback

-- ── 1. Budget Scenarios (scenario planning engine) ────────────────────────────
CREATE TABLE IF NOT EXISTS budget_scenarios (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  scenario_type            TEXT NOT NULL DEFAULT 'expected'
                           CHECK (scenario_type IN ('best','expected','constrained','custom')),
  description              TEXT,
  fiscal_year              TEXT NOT NULL,

  -- Base assumptions (user-supplied or defaulted)
  base_revenue             NUMERIC(16,2) NOT NULL DEFAULT 0,  -- total baseline revenue input

  -- Assumption variables (deltas applied on top of base)
  enrollment_change_pct    NUMERIC(6,2)  NOT NULL DEFAULT 0,   -- e.g. -3.5 = 3.5% enrollment drop
  tuition_change_pct       NUMERIC(6,2)  NOT NULL DEFAULT 0,   -- e.g. +2.0 = 2% tuition increase
  state_funding_change_pct NUMERIC(6,2)  NOT NULL DEFAULT 0,   -- e.g. -5.0 = 5% cut to state funding
  salary_pool_pct          NUMERIC(6,2)  NOT NULL DEFAULT 2.5, -- % of payroll added as salary increase
  hiring_freeze            BOOLEAN       NOT NULL DEFAULT false,
  capital_deferral_pct     NUMERIC(6,2)  NOT NULL DEFAULT 0,   -- % of capital requests deferred
  other_expense_change_pct NUMERIC(6,2)  NOT NULL DEFAULT 0,   -- % change to other operating expenses

  -- Computed projections (stored after engine runs)
  projected_revenue        NUMERIC(16,2),
  projected_expense        NUMERIC(16,2),
  projected_surplus_deficit NUMERIC(16,2),  -- positive = surplus, negative = deficit
  base_expense             NUMERIC(16,2),   -- approved requests total before adjustments
  revenue_breakdown        JSONB,           -- { enrollment: N, tuition: N, stateAid: N, other: N }
  expense_breakdown        JSONB,           -- { salaries: N, capital: N, operating: N, grants: N }

  created_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_budget_scenarios_updated_at ON budget_scenarios;
CREATE TRIGGER trg_budget_scenarios_updated_at
BEFORE UPDATE ON budget_scenarios
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_bs_fiscal_year  ON budget_scenarios(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_bs_created_by   ON budget_scenarios(created_by);
CREATE INDEX IF NOT EXISTS idx_bs_type         ON budget_scenarios(scenario_type);

-- ── 2. Decision Log (institutional memory & rationale tracking) ───────────────
CREATE TABLE IF NOT EXISTS decision_log (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type               TEXT NOT NULL DEFAULT 'other'
                           CHECK (entry_type IN ('budget_request','policy','strategic','operational','other')),
  subject                  TEXT NOT NULL,
  context                  TEXT,                -- background / situation
  decision                 TEXT NOT NULL,        -- what was decided
  rationale                TEXT,                 -- why
  alternatives_considered  TEXT,                 -- what else was considered
  assumptions              TEXT,                 -- what assumptions drove the decision
  outcome                  TEXT,                 -- what happened as a result (can be filled in later)
  fiscal_year              TEXT,
  reference_id             UUID,                 -- FK to budget_requests.id (soft, no constraint)
  decided_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_decision_log_updated_at ON decision_log;
CREATE TRIGGER trg_decision_log_updated_at
BEFORE UPDATE ON decision_log
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_dl_entry_type   ON decision_log(entry_type);
CREATE INDEX IF NOT EXISTS idx_dl_fiscal_year  ON decision_log(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_dl_reference_id ON decision_log(reference_id);
CREATE INDEX IF NOT EXISTS idx_dl_decided_by   ON decision_log(decided_by);
CREATE INDEX IF NOT EXISTS idx_dl_created_at   ON decision_log(created_at DESC);

-- ── 3. Chat Feedback (continuous learning loop) ───────────────────────────────
CREATE TABLE IF NOT EXISTS chat_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating        SMALLINT NOT NULL CHECK (rating IN (1, -1)),  -- 1 = helpful, -1 = not helpful
  correction    TEXT,          -- user-supplied correction text
  feedback_type TEXT CHECK (feedback_type IN ('helpful','not_helpful','wrong_answer','incomplete','outdated','other')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cf_message_id ON chat_feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_cf_user_id    ON chat_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_cf_rating     ON chat_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_cf_created_at ON chat_feedback(created_at DESC);

-- ── 4. Add agent_type column to chat_messages for multi-agent tracking ─────────
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS agent_type TEXT
  CHECK (agent_type IN ('general','policy','analyst','forecasting','board','drafting'));
