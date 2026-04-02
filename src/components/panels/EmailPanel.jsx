import { useEffect, useMemo, useState } from "react";
import { getEmailConfig, syncEmail, testEmailConnection } from "../../services/emailApi.js";

const providerMeta = {
  gmail: {
    title: "Gmail",
    description: "Connect via Gmail SMTP using an App Password.",
    fields: [
      { key: "mailbox", label: "Gmail Address", placeholder: "budgetai@gmail.com", type: "text" },
      { key: "appPassword", label: "App Password", placeholder: "16-character Google App Password", type: "password" }
    ]
  },
  m365: {
    title: "Microsoft 365 / Graph",
    description: "Connect using Microsoft Graph application credentials.",
    fields: [
      { key: "tenantId", label: "Tenant ID", placeholder: "Enter Entra tenant id", type: "text" },
      { key: "clientId", label: "Application (Client) ID", placeholder: "Enter app client id", type: "text" },
      { key: "clientSecret", label: "Client Secret", placeholder: "Enter client secret value", type: "password" },
      { key: "mailbox", label: "Mailbox Address", placeholder: "askbudget@stlcc.edu", type: "text" }
    ]
  },
  smtp: {
    title: "SMTP / IMAP",
    description: "Connect standard mail servers using SMTP settings.",
    fields: [
      { key: "smtpHost", label: "SMTP Host", placeholder: "smtp.yourdomain.com", type: "text" },
      { key: "smtpPort", label: "SMTP Port", placeholder: "587", type: "text" },
      { key: "imapHost", label: "IMAP Host", placeholder: "imap.yourdomain.com (optional)", type: "text" },
      { key: "mailbox", label: "Mailbox Address", placeholder: "budget@yourdomain.com", type: "text" },
      { key: "username", label: "Username", placeholder: "Leave blank to use mailbox address", type: "text" },
      { key: "password", label: "Password", placeholder: "SMTP password", type: "password" }
    ]
  }
};

const attachmentTypes = ["PDF", "DOCX", "XLSX", "PPTX", "CSV", "TXT"];

export default function EmailPanel({ authToken }) {
  const [provider, setProvider] = useState("gmail");
  const [fieldValues, setFieldValues] = useState({});
  const [storeAttachments, setStoreAttachments] = useState(true);
  const [autoTag, setAutoTag] = useState(true);
  const [selectedAttachmentTypes, setSelectedAttachmentTypes] = useState(attachmentTypes);
  const [connectionStatus, setConnectionStatus] = useState("Not connected");
  const [statusOk, setStatusOk] = useState(false);
  const [mailboxStats, setMailboxStats] = useState({ synced: 0, attachments: 0 });
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connectedDetails, setConnectedDetails] = useState(null);

  const currentProvider = useMemo(() => providerMeta[provider], [provider]);

  function buildConnectedDetails(p, fields) {
    const base = { provider: p, providerTitle: providerMeta[p]?.title || p, mailbox: fields.mailbox || "" };
    if (p === "m365") {
      return { ...base, tenantId: fields.tenantId || "", clientId: fields.clientId ? `${fields.clientId.slice(0, 8)}••••` : "" };
    }
    if (p === "smtp") {
      return { ...base, smtpHost: fields.smtpHost || "", smtpPort: fields.smtpPort || "587" };
    }
    return base;
  }

  useEffect(() => {
    if (!authToken) return;

    getEmailConfig(authToken)
      .then(({ config }) => {
        if (!config) return;
        setProvider(config.provider || "gmail");
        setMailboxStats({ synced: config.synced_emails || 0, attachments: config.synced_attachments || 0 });
        const isConnected = config.status === "connected";
        setStatusOk(isConnected);
        setConnectionStatus(
          isConnected
            ? `Connected to ${providerMeta[config.provider]?.title || config.provider}`
            : "Not connected"
        );
        // Pre-fill non-secret fields
        const saved = config.config || {};
        const filled = {
          mailbox: saved.mailbox || "",
          tenantId: saved.tenantId || "",
          clientId: saved.clientId || "",
          smtpHost: saved.smtpHost || "",
          smtpPort: saved.smtpPort || "",
          imapHost: saved.imapHost || "",
          username: saved.username || ""
        };
        setFieldValues(filled);
        if (isConnected) {
          setConnectedDetails(buildConnectedDetails(config.provider, filled));
        }
      })
      .catch(() => {});
  }, [authToken]);

  const toggleType = (type) => {
    setSelectedAttachmentTypes((previous) =>
      previous.includes(type) ? previous.filter((item) => item !== type) : [...previous, type]
    );
  };

  const handleProviderChange = (key) => {
    setProvider(key);
    setConnectionStatus("Not connected");
    setStatusOk(false);
    setConnectedDetails(null);
    setMailboxStats({ synced: 0, attachments: 0 });
    setFieldValues({});
  };

  const setField = (key, value) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleConnectionTest = async () => {
    if (!authToken) return;

    setTesting(true);
    setConnectionStatus("Testing connection...");
    setStatusOk(false);

    try {
      const result = await testEmailConnection(authToken, provider, fieldValues);
      setStatusOk(result.connected);
      setConnectionStatus(result.message);
      if (result.connected) {
        setConnectedDetails(buildConnectedDetails(provider, fieldValues));
      } else {
        setConnectedDetails(null);
      }
    } catch (error) {
      setStatusOk(false);
      setConnectionStatus(`Error: ${error.message || "Connection test failed"}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    if (!authToken || !statusOk) return;

    setSyncing(true);
    try {
      const result = await syncEmail(authToken, selectedAttachmentTypes);
      setMailboxStats({ synced: result.stats.synced, attachments: result.stats.attachments });
    } catch (error) {
      setConnectionStatus(`Sync failed: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <article className="panel active">
      <div className="panel-head">
        <h2>Email Assistant Setup</h2>
        <p>Configure mailbox integration and control how email attachments feed the budget knowledge base.</p>
      </div>

      <section className="setup-card">
        <h3>Email Service</h3>
        <div className="choice-grid three-col">
          {Object.entries(providerMeta).map(([key, item]) => (
            <button
              key={key}
              type="button"
              className={`choice-btn ${provider === key ? "active" : ""}`}
              onClick={() => handleProviderChange(key)}
            >
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>

        <div className="config-grid">
          {currentProvider.fields.map((field) => (
            <label key={field.key} className="field">
              <span>{field.label}</span>
              <input
                type={field.type}
                placeholder={field.placeholder}
                value={fieldValues[field.key] || ""}
                onChange={(e) => setField(field.key, e.target.value)}
                autoComplete={field.type === "password" ? "current-password" : "off"}
              />
            </label>
          ))}
        </div>

        <div className="inline-actions">
          <button type="button" className="action-btn" onClick={handleConnectionTest} disabled={testing}>
            {testing ? "Testing..." : "Test & Save Connection"}
          </button>
          {statusOk && (
            <button type="button" className="action-btn" onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          )}
          <p className="status-line" style={{ color: statusOk ? "var(--accent, #22c55e)" : undefined }}>
            {connectionStatus}
          </p>
        </div>

        {connectedDetails && (
          <div style={{ marginTop: "1.25rem", padding: "1rem 1.25rem", borderRadius: "0.5rem", background: "var(--surface-2, rgba(255,255,255,0.05))", border: "1px solid var(--accent, #22c55e)" }}>
            <p style={{ fontWeight: 600, marginBottom: "0.75rem", color: "var(--accent, #22c55e)" }}>
              ✓ Connected Account
            </p>
            <div className="config-grid" style={{ gap: "0.5rem 1.5rem" }}>
              <div>
                <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.2rem" }}>Provider</p>
                <strong>{connectedDetails.providerTitle}</strong>
              </div>
              <div>
                <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.2rem" }}>Mailbox</p>
                <strong>{connectedDetails.mailbox || "—"}</strong>
              </div>
              {connectedDetails.tenantId && (
                <div>
                  <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.2rem" }}>Tenant ID</p>
                  <strong>{connectedDetails.tenantId}</strong>
                </div>
              )}
              {connectedDetails.clientId && (
                <div>
                  <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.2rem" }}>Client ID</p>
                  <strong>{connectedDetails.clientId}</strong>
                </div>
              )}
              {connectedDetails.smtpHost && (
                <div>
                  <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.2rem" }}>SMTP Host</p>
                  <strong>{connectedDetails.smtpHost}:{connectedDetails.smtpPort}</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="setup-card">
        <h3>Attachment to Knowledge Base</h3>
        <div className="toggle-row">
          <label>
            <input
              type="checkbox"
              checked={storeAttachments}
              onChange={(event) => setStoreAttachments(event.target.checked)}
            />
            Store supported attachments into knowledge base
          </label>
          <label>
            <input type="checkbox" checked={autoTag} onChange={(event) => setAutoTag(event.target.checked)} />
            Auto-tag by department, fiscal year, and policy area
          </label>
        </div>

        <p className="section-caption">Attachment types to ingest</p>
        <div className="type-pills">
          {attachmentTypes.map((type) => (
            <label key={type} className={`pill ${selectedAttachmentTypes.includes(type) ? "active" : ""}`}>
              <input
                type="checkbox"
                checked={selectedAttachmentTypes.includes(type)}
                onChange={() => toggleType(type)}
              />
              {type}
            </label>
          ))}
        </div>

        <div className="metric-strip">
          <div>
            <p>Emails Synced</p>
            <strong>{mailboxStats.synced}</strong>
          </div>
          <div>
            <p>Attachments Stored</p>
            <strong>{mailboxStats.attachments}</strong>
          </div>
          <div>
            <p>Ingestion Mode</p>
            <strong>{storeAttachments ? "Enabled" : "Disabled"}</strong>
          </div>
        </div>
      </section>
    </article>
  );
}
