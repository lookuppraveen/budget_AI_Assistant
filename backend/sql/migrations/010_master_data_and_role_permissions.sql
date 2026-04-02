CREATE TABLE IF NOT EXISTS master_data_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_data_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id INTEGER NOT NULL REFERENCES master_data_types(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_master_data_value UNIQUE (type_id, value)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_master_data_values_type_id ON master_data_values(type_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);

DROP TRIGGER IF EXISTS trg_master_data_types_set_updated_at ON master_data_types;
CREATE TRIGGER trg_master_data_types_set_updated_at
BEFORE UPDATE ON master_data_types
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_master_data_values_set_updated_at ON master_data_values;
CREATE TRIGGER trg_master_data_values_set_updated_at
BEFORE UPDATE ON master_data_values
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO master_data_types (name)
VALUES ('Fund Type'), ('Fiscal Year'), ('Request Status'), ('Expense Category')
ON CONFLICT (name) DO NOTHING;

INSERT INTO master_data_values (type_id, value)
SELECT t.id, v.value
FROM master_data_types t
JOIN (VALUES
  ('Fund Type', 'General Fund'),
  ('Fund Type', 'Restricted Fund'),
  ('Fund Type', 'Capital Fund'),
  ('Fiscal Year', 'FY25'),
  ('Fiscal Year', 'FY26'),
  ('Fiscal Year', 'FY27'),
  ('Request Status', 'Draft'),
  ('Request Status', 'Submitted'),
  ('Request Status', 'Reviewed'),
  ('Request Status', 'Approved'),
  ('Expense Category', 'Personnel'),
  ('Expense Category', 'Operations'),
  ('Expense Category', 'Technology'),
  ('Expense Category', 'Facilities')
) AS v(type_name, value)
  ON v.type_name = t.name
ON CONFLICT (type_id, value) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM roles r
JOIN (VALUES
  ('Admin', 'Master Data'),
  ('Admin', 'Users'),
  ('Admin', 'Roles'),
  ('Admin', 'Departments'),
  ('Admin', 'Audit'),
  ('Admin', 'Documents'),
  ('Admin', 'Wizard'),
  ('Budget Analyst', 'Knowledge'),
  ('Budget Analyst', 'Email'),
  ('Budget Analyst', 'Reports'),
  ('Budget Analyst', 'Documents'),
  ('Department Editor', 'Requests'),
  ('Department Editor', 'Knowledge'),
  ('Department Editor', 'Documents'),
  ('Read Only', 'Reports')
) AS p(role_name, permission_key)
  ON p.role_name = r.name
ON CONFLICT (role_id, permission_key) DO NOTHING;
