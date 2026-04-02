CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  domain TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  submitted_by UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Hold', 'Rejected')),
  review_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_department_id ON knowledge_documents(department_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON knowledge_documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_domain ON knowledge_documents(domain);

DROP TRIGGER IF EXISTS trg_documents_set_updated_at ON knowledge_documents;
CREATE TRIGGER trg_documents_set_updated_at
BEFORE UPDATE ON knowledge_documents
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();