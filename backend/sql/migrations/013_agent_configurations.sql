CREATE TABLE IF NOT EXISTS agent_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  applies_to_all BOOLEAN NOT NULL DEFAULT TRUE,
  scope TEXT NOT NULL DEFAULT '',
  risk_language TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_configuration_assignments (
  agent_id UUID NOT NULL REFERENCES agent_configurations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, user_id)
);

CREATE TABLE IF NOT EXISTS agent_configuration_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_configurations(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  meaning TEXT NOT NULL,
  placeholder TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_agent_configuration_step UNIQUE (agent_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_configurations_department_id ON agent_configurations(department_id);
CREATE INDEX IF NOT EXISTS idx_agent_configuration_assignments_agent_id ON agent_configuration_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_configuration_assignments_user_id ON agent_configuration_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_configuration_steps_agent_id ON agent_configuration_steps(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_configuration_steps_order ON agent_configuration_steps(agent_id, step_order);

DROP TRIGGER IF EXISTS trg_agent_configurations_set_updated_at ON agent_configurations;
CREATE TRIGGER trg_agent_configurations_set_updated_at
BEFORE UPDATE ON agent_configurations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_configuration_steps_set_updated_at ON agent_configuration_steps;
CREATE TRIGGER trg_agent_configuration_steps_set_updated_at
BEFORE UPDATE ON agent_configuration_steps
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
