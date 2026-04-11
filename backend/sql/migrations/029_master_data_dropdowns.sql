-- Migration 029: Seed missing master-data types and values
-- Adds: Request Type, Cost Type, Priority, Knowledge Domain
-- Fixes: Fiscal Year range (FY23, FY24, FY28 were missing)

-- ── 1. Ensure all required types exist ───────────────────────────────────────
INSERT INTO master_data_types (name)
VALUES
  ('Request Type'),
  ('Cost Type'),
  ('Priority'),
  ('Knowledge Domain')
ON CONFLICT (name) DO NOTHING;

-- ── 2. Fiscal Year — fill gaps (FY23, FY24, FY28) ───────────────────────────
INSERT INTO master_data_values (type_id, value)
SELECT t.id, v.val
FROM master_data_types t
CROSS JOIN (VALUES ('FY23'), ('FY24'), ('FY28')) AS v(val)
WHERE t.name = 'Fiscal Year'
ON CONFLICT (type_id, value) DO NOTHING;

-- ── 3. Request Type values ────────────────────────────────────────────────────
INSERT INTO master_data_values (type_id, value)
SELECT t.id, v.val
FROM master_data_types t
CROSS JOIN (VALUES
  ('operational'),
  ('capital'),
  ('staffing'),
  ('grant'),
  ('other')
) AS v(val)
WHERE t.name = 'Request Type'
ON CONFLICT (type_id, value) DO NOTHING;

-- ── 4. Cost Type values ───────────────────────────────────────────────────────
INSERT INTO master_data_values (type_id, value)
SELECT t.id, v.val
FROM master_data_types t
CROSS JOIN (VALUES
  ('one-time'),
  ('recurring'),
  ('mixed')
) AS v(val)
WHERE t.name = 'Cost Type'
ON CONFLICT (type_id, value) DO NOTHING;

-- ── 5. Priority values ────────────────────────────────────────────────────────
INSERT INTO master_data_values (type_id, value)
SELECT t.id, v.val
FROM master_data_types t
CROSS JOIN (VALUES
  ('low'),
  ('normal'),
  ('high'),
  ('critical')
) AS v(val)
WHERE t.name = 'Priority'
ON CONFLICT (type_id, value) DO NOTHING;

-- ── 6. Knowledge Domain values ────────────────────────────────────────────────
INSERT INTO master_data_values (type_id, value)
SELECT t.id, v.val
FROM master_data_types t
CROSS JOIN (VALUES
  ('Budget Policies'),
  ('Budget Procedures'),
  ('Historical Budgets'),
  ('Budget Training Materials'),
  ('Board Presentations'),
  ('Department Requests'),
  ('Budget Manager Correspondence'),
  ('Calendar & Deadlines'),
  ('Revenue Assumptions')
) AS v(val)
WHERE t.name = 'Knowledge Domain'
ON CONFLICT (type_id, value) DO NOTHING;
