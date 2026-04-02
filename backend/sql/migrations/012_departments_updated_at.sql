ALTER TABLE departments
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_departments_set_updated_at ON departments;
CREATE TRIGGER trg_departments_set_updated_at
BEFORE UPDATE ON departments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
