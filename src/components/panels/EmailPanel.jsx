import { useEffect, useMemo, useState } from "react";
import { getEmailConfig, syncEmail, testEmailConnection, getResponderStatus, runResponderNow } from "../../services/emailApi.js";

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

  // Email Responder state
  const [responderCounts, setResponderCounts] = useState({ total: 0, replied: 0, failed: 0, skipped: 0, pending: 0 });
  const [responderRecent, setResponderRecent] = useState([]);
  const [responderLastReplied, setResponderLastReplied] = useState(null);
  const [runningCycle, setRunningCycle] = useState(false);
  const [cycleResult, setCycleResult] = useState(null);

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

    getResponderStatus(authToken)
      .then((data) => {
        const c = data.counts || {};
        setResponderCounts({
          total:   Number(c.total   || 0),
          replied: Number(c.replied || 0),
          failed:  Number(c.failed  || 0),
          skipped: Number(c.skipped || 0),
          pending: Number(c.pending || 0)
        });
        setResponderLastReplied(c.last_replied_at || null);
        setResponderRecent(data.recent || []);
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

  const handleRunCycle = async () => {
    if (!authToken) return;
    setRunningCycle(true);
    setCycleResult(null);
    try {
      const result = await runResponderNow(authToken);
      setCycleResult(result.stats);
      // Refresh counts
      const statusData = await getResponderStatus(authToken);
      const c = statusData.counts || {};
      setResponderCounts({
        total:   Number(c.total   || 0),
        replied: Number(c.replied || 0),
        failed:  Number(c.failed  || 0),
        skipped: Number(c.skipped || 0),
        pending: Number(c.pending || 0)
      });
      setResponderLastReplied(c.last_replied_at || null);
      setResponderRecent(statusData.recent || []);
    } catch (error) {
      setCycleResult({ error: error.message });
    } finally {
      setRunningCycle(false);
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

      {/* ── Email Responder ───────────────────────────────────────────────── */}
      <section className="setup-card">
        <h3>Email Responder</h3>
        <p style={{ marginBottom: "1rem", opacity: 0.8, lineHeight: 1.6 }}>
          Users can email <strong>budgetassistant@stlcc.edu</strong> and the Budget Agent
          will automatically reply with an AI-generated answer — the same response it gives
          via chat or voice. The inbox is polled every 5 minutes when the responder is active.
        </p>

        <div className="metric-strip" style={{ marginBottom: "1.25rem" }}>
          <div>
            <p>Total Received</p>
            <strong>{responderCounts.total}</strong>
          </div>
          <div>
            <p>Replied</p>
            <strong style={{ color: "var(--accent, #22c55e)" }}>{responderCounts.replied}</strong>
          </div>
          <div>
            <p>Pending</p>
            <strong style={{ color: responderCounts.pending > 0 ? "#f59e0b" : undefined }}>{responderCounts.pending}</strong>
          </div>
          <div>
            <p>Failed</p>
            <strong style={{ color: responderCounts.failed > 0 ? "#ef4444" : undefined }}>{responderCounts.failed}</strong>
          </div>
          <div>
            <p>Skipped</p>
            <strong>{responderCounts.skipped}</strong>
          </div>
          {responderLastReplied && (
            <div>
              <p>Last Reply Sent</p>
              <strong style={{ fontSize: "0.85em" }}>{new Date(responderLastReplied).toLocaleString()}</strong>
            </div>
          )}
        </div>

        <div className="inline-actions" style={{ marginBottom: "1.25rem" }}>
          <button
            type="button"
            className="action-btn"
            onClick={handleRunCycle}
            disabled={runningCycle || !statusOk}
            title={!statusOk ? "Connect a mailbox first" : "Poll inbox now"}
          >
            {runningCycle ? "Checking inbox..." : "Check Inbox Now"}
          </button>
          {cycleResult && !cycleResult.error && (
            <p className="status-line" style={{ color: "var(--accent, #22c55e)" }}>
              Cycle done — processed: {cycleResult.processed}, replied: {cycleResult.replied}, skipped: {cycleResult.skipped}
            </p>
          )}
          {cycleResult?.error && (
            <p className="status-line" style={{ color: "#ef4444" }}>
              Error: {cycleResult.error}
            </p>
          )}
        </div>

        {responderRecent.length > 0 && (
          <>
            <p className="section-caption" style={{ marginBottom: "0.5rem" }}>Recent inbound emails</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {responderRecent.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "0.375rem",
                    background: "var(--surface-2, rgba(255,255,255,0.04))",
                    border: "1px solid var(--border, rgba(255,255,255,0.1))",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "0.25rem 1rem",
                    alignItems: "start"
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, marginBottom: "0.15rem", fontSize: "0.9em" }}>
                      {item.sender_email}
                      {item.sender_name && item.sender_name !== item.sender_email
                        ? ` (${item.sender_name})`
                        : ""}
                    </p>
                    <p style={{ opacity: 0.65, fontSize: "0.82em" }}>{item.subject || "(no subject)"}</p>
                    {item.error_message && (
                      <p style={{ color: "#ef4444", fontSize: "0.8em", marginTop: "0.2rem" }}>{item.error_message}</p>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.15rem 0.6rem",
                        borderRadius: "9999px",
                        fontSize: "0.75em",
                        fontWeight: 600,
                        background:
                          item.status === "replied" ? "rgba(34,197,94,0.15)" :
                          item.status === "failed"  ? "rgba(239,68,68,0.15)"  :
                          item.status === "pending" ? "rgba(245,158,11,0.15)" :
                          "rgba(255,255,255,0.08)",
                        color:
                          item.status === "replied" ? "#22c55e" :
                          item.status === "failed"  ? "#ef4444"  :
                          item.status === "pending" ? "#f59e0b" :
                          "inherit"
                      }}
                    >
                      {item.status}
                    </span>
                    {item.replied_at && (
                      <p style={{ opacity: 0.5, fontSize: "0.75em", marginTop: "0.2rem" }}>
                        {new Date(item.replied_at).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </article>
  );
}
