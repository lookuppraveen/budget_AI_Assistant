-- Phase 2: Budget Request Ontology, Scoring Engine & Decision Rules
-- Tables: budget_requests, budget_request_scores, budget_request_validations,
--         budget_scoring_criteria, anomaly_flags

-- ── 1. Core budget request table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Submitter info
  submitted_by         UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  department_id        INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,

  -- Request classification
  fiscal_year          TEXT NOT NULL,                          -- e.g. FY27
  fund_type            TEXT,                                   -- General, Restricted, Capital
  expense_category     TEXT,                                   -- Personnel, Operations, Technology, Facilities
  request_type         TEXT NOT NULL DEFAULT 'operational'
                       CHECK (request_type IN ('operational','capital','staffing','grant','other')),
  cost_type            TEXT NOT NULL DEFAULT 'recurring'
                       CHECK (cost_type IN ('one-time','recurring','mixed')),

  -- Amounts
  base_budget_amount   NUMERIC(14,2) DEFAULT 0,
  requested_amount     NUMERIC(14,2) NOT NULL,
  recurring_amount     NUMERIC(14,2) DEFAULT 0,
  one_time_amount      NUMERIC(14,2) DEFAULT 0,

  -- Justification & alignment
  title                TEXT NOT NULL,
  justification        TEXT NOT NULL,
  strategic_alignment  TEXT,
  impact_description   TEXT,

  -- Workflow status
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','submitted','under_review','approved','denied','on_hold')),
  priority             TEXT DEFAULT 'normal'
                       CHECK (priority IN ('low','normal','high','critical')),

  -- AI analysis output (populated after LLM analysis runs)
  ai_summary           TEXT,
  ai_classified_type   TEXT,
  ai_missing_fields    TEXT[],
  ai_confidence        NUMERIC(4,3),
  analyzed_at          TIMESTAMPTZ,

  -- Reviewer assignment & notes
  assigned_to          UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_notes       TEXT,
  reviewed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,
  decision_rationale   TEXT,

  -- Risk flag (set by rules engine)
  risk_flag            TEXT CHECK (risk_flag IN ('none','low','medium','high','critical')),
  risk_reason          TEXT,

  -- Submission date
  submitted_at         TIMESTAMPTZ,
  deadline             DATE,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_br_department_id ON budget_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_br_submitted_by  ON budget_requests(submitted_by);
CREATE INDEX IF NOT EXISTS idx_br_status        ON budget_requests(status);
CREATE INDEX IF NOT EXISTS idx_br_fiscal_year   ON budget_requests(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_br_created_at    ON budget_requests(created_at DESC);

DROP TRIGGER IF EXISTS trg_budget_requests_set_updated_at ON budget_requests;
CREATE TRIGGER trg_budget_requests_set_updated_at
BEFORE UPDATE ON budget_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. Scoring criteria configuration (admin-managed weights) ─────────────────
CREATE TABLE IF NOT EXISTS budget_scoring_criteria (
  id           SERIAL PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,  -- e.g. 'strategic_alignment'
  label        TEXT NOT NULL,
  description  TEXT,
  weight       NUMERIC(4,3) NOT NULL DEFAULT 0.143,  -- default equal weight (1/7)
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_bsc_set_updated_at ON budget_scoring_criteria;
CREATE TRIGGER trg_bsc_set_updated_at
BEFORE UPDATE ON budget_scoring_criteria
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed the 7 roadmap criteria
INSERT INTO budget_scoring_criteria (key, label, description, weight) VALUES
  ('strategic_alignment',  'Strategic Plan Alignment',      'Degree to which the request supports institutional strategic priorities',    0.200),
  ('student_impact',       'Impact on Students',            'Direct or indirect benefit to student success, access, or experience',       0.200),
  ('mandatory_flag',       'Mandatory vs Discretionary',    'Whether funding is required by law, accreditation, or board policy',         0.150),
  ('operational_risk',     'Operational Risk if Not Funded','Risk to operations, compliance, or service continuity if denied',            0.150),
  ('return_on_investment',  'Return on Investment',          'Measurable efficiency gains, cost savings, or revenue impact',               0.100),
  ('compliance_need',      'Accreditation / Compliance',    'Required by accreditor, regulator, or legal mandate',                       0.100),
  ('equity_access',        'Workforce / Equity / Access',   'Supports workforce development, equity goals, or access for underserved students', 0.100)
ON CONFLICT (key) DO NOTHING;

-- ── 3. Scoring results per request ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_request_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID NOT NULL REFERENCES budget_requests(id) ON DELETE CASCADE,
  criteria_key   TEXT NOT NULL REFERENCES budget_scoring_criteria(key) ON DELETE CASCADE,

  -- Score 0–10 assigned by LLM or reviewer
  raw_score      NUMERIC(4,1) NOT NULL CHECK (raw_score >= 0 AND raw_score <= 10),
  weighted_score NUMERIC(6,4),  -- raw_score * criteria_weight / 10

  -- Explanation of why this score was assigned
  rationale      TEXT,

  -- Source of score
  scored_by      TEXT NOT NULL DEFAULT 'ai' CHECK (scored_by IN ('ai','reviewer','system')),
  scored_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (request_id, criteria_key)
);

CREATE INDEX IF NOT EXISTS idx_brs_request_id ON budget_request_scores(request_id);

-- ── 4. Validation results (rules engine output) ───────────────────────────────
CREATE TABLE IF NOT EXISTS budget_request_validations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID NOT NULL REFERENCES budget_requests(id) ON DELETE CASCADE,
  rule_key       TEXT NOT NULL,  -- e.g. 'missing_justification', 'exceeds_threshold'
  rule_label     TEXT NOT NULL,
  severity       TEXT NOT NULL CHECK (severity IN ('info','warning','error')),
  message        TEXT NOT NULL,
  passed         BOOLEAN NOT NULL DEFAULT false,
  checked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (request_id, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_brv_request_id ON budget_request_validations(request_id);
CREATE INDEX IF NOT EXISTS idx_brv_severity   ON budget_request_validations(severity);

-- ── 5. Anomaly flags (trend/duplicate detection) ──────────────────────────────
CREATE TABLE IF NOT EXISTS budget_anomaly_flags (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID REFERENCES budget_requests(id) ON DELETE CASCADE,
  department_id  INTEGER REFERENCES departments(id) ON DELETE CASCADE,
  fiscal_year    TEXT,
  flag_type      TEXT NOT NULL
                 CHECK (flag_type IN (
                   'yoy_increase','duplicate_request','exceeds_dept_norm',
                   'salary_anomaly','revenue_misalignment','missing_prior_year'
                 )),
  severity       TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  description    TEXT NOT NULL,
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_baf_request_id    ON budget_anomaly_flags(request_id);
CREATE INDEX IF NOT EXISTS idx_baf_department_id ON budget_anomaly_flags(department_id);
CREATE INDEX IF NOT EXISTS idx_baf_fiscal_year   ON budget_anomaly_flags(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_baf_is_resolved   ON budget_anomaly_flags(is_resolved);

-- ── 6. Analytics: add Budget Requests permission to relevant roles ────────────
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM roles r
JOIN (VALUES
  ('Admin',            'Budget Requests'),
  ('Budget Analyst',   'Budget Requests'),
  ('Department Editor','Budget Requests'),
  ('Cabinet',          'Budget Requests')
) AS p(role_name, permission_key)
  ON p.role_name = r.name
ON CONFLICT (role_id, permission_key) DO NOTHING;
