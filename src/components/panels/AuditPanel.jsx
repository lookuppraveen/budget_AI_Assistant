import { useEffect, useState } from "react";
import { getAuditLogs, getAuditMetrics } from "../../services/insightsApi.js";

const ACTION_LABELS = {
  "user.login": "Login",
  "user.updated": "User Updated",
  "document.approved": "Doc Approved",
  "document.rejected": "Doc Rejected",
  "document.hold": "Doc On Hold",
  "document.pending": "Doc Pending",
  "email.sync": "Email Sync",
  "sharepoint.sync": "SharePoint Sync"
};

const ENTITY_FILTERS = ["", "document", "user", "email_integration", "sharepoint_integration"];
const PAGE_SIZE = 50;

export default function AuditPanel({ authToken }) {
  const [metrics, setMetrics] = useState([]);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [entityType, setEntityType] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authToken) return;
    getAuditMetrics(authToken)
      .then(({ metrics: data }) => setMetrics(data || []))
      .catch((err) => setError(err.message || "Unable to load audit metrics."))
      .finally(() => setLoading(false));
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    setLogsLoading(true);
    getAuditLogs(authToken, {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      action: actionFilter || undefined,
      entityType: entityType || undefined
    })
      .then(({ logs: data, total: t }) => {
        setLogs(data || []);
        setTotal(t || 0);
      })
      .catch(() => {})
      .finally(() => setLogsLoading(false));
  }, [authToken, page, actionFilter, entityType]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <article className="panel active">
      <div className="panel-head">
        <h2>Citations &amp; Audit</h2>
        <p>Live signals from chat sessions and a full activity log for governance.</p>
      </div>

      {loading && <p className="section-caption">Loading audit data...</p>}
      {error && <p className="section-caption">{error}</p>}

      {!loading && !error && (
        <div className="metric-grid">
          {metrics.map((metric) => (
            <div key={metric.label} className="metric">
              <p className="metric-label">{metric.label}</p>
              <p className="metric-value">{metric.value}</p>
            </div>
          ))}
        </div>
      )}

      <section className="setup-card" style={{ marginTop: "1.5rem" }}>
        <h3>Activity Log</h3>
        <p className="section-caption">All significant user actions — login, document decisions, sync events, and user management.</p>

        <div className="config-grid two-col" style={{ marginBottom: "0.75rem" }}>
          <label className="field">
            <span>Entity Type</span>
            <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(0); }}>
              {ENTITY_FILTERS.map((t) => (
                <option key={t} value={t}>{t || "All"}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Action</span>
            <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}>
              <option value="">All</option>
              {Object.keys(ACTION_LABELS).map((a) => (
                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
              ))}
            </select>
          </label>
        </div>

        {logsLoading && <p className="section-caption">Loading...</p>}

        {!logsLoading && (
          <>
            <div className="queue-table">
              <div className="queue-table-inner" style={{ minWidth: "640px" }}>
              <div className="queue-row queue-head" style={{ gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1.4fr" }}>
                <span>Time</span>
                <span>User</span>
                <span>Role</span>
                <span>Action</span>
                <span>Entity</span>
              </div>
              {logs.length === 0 && <p className="empty-queue">No audit entries yet.</p>}
              {logs.map((log) => (
                <div
                  className="queue-row"
                  key={log.id}
                  style={{ gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1.4fr", fontSize: "0.8rem" }}
                >
                  <span>
                    {new Date(log.created_at).toLocaleString("en-US", {
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit"
                    })}
                  </span>
                  <span title={log.user_email} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.user_email || "system"}
                  </span>
                  <span>{log.user_role || "—"}</span>
                  <span>
                    <span className={`status-chip ${
                      log.action === "document.approved" ? "ready"
                      : log.action === "document.rejected" ? "rejected"
                      : log.action === "document.hold" ? "hold"
                      : log.action.includes("sync") ? "pending"
                      : ""
                    }`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </span>
                  <span style={{ opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.entity_type
                      ? `${log.entity_type}${log.entity_id ? ` / ${log.entity_id.slice(0, 8)}…` : ""}`
                      : "—"}
                  </span>
                </div>
              ))}
              </div>
            </div>

            {totalPages > 1 && (
              <div className="inline-actions" style={{ marginTop: "0.75rem" }}>
                <button type="button" className="action-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <span style={{ fontSize: "0.82rem", opacity: 0.7 }}>
                  Page {page + 1} / {totalPages} &nbsp;({total} total)
                </span>
                <button type="button" className="action-btn" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </article>
  );
}
