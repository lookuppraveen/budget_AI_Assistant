-- Email integration config (one active row)
CREATE TABLE IF NOT EXISTS email_integrations (
  id           SERIAL PRIMARY KEY,
  provider     VARCHAR(20) NOT NULL CHECK (provider IN ('gmail', 'm365', 'smtp')),
  config       JSONB NOT NULL DEFAULT '{}',
  status       VARCHAR(30) NOT NULL DEFAULT 'disconnected',
  last_synced_at  TIMESTAMPTZ,
  synced_emails   INT NOT NULL DEFAULT 0,
  synced_attachments INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SharePoint integration config (one active row)
CREATE TABLE IF NOT EXISTS sharepoint_integrations (
  id             SERIAL PRIMARY KEY,
  tenant_id      TEXT NOT NULL DEFAULT '',
  client_id      TEXT NOT NULL DEFAULT '',
  client_secret  TEXT NOT NULL DEFAULT '',
  site_url       TEXT NOT NULL DEFAULT '',
  library_path   TEXT NOT NULL DEFAULT '',
  domain         TEXT NOT NULL DEFAULT '',
  status         VARCHAR(30) NOT NULL DEFAULT 'disconnected',
  last_synced_at TIMESTAMPTZ,
  synced_files   INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
