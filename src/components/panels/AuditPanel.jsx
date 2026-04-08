import { useEffect, useState } from "react";
import { getAuditLogs, getAuditMetricDetail, getAuditMetrics } from "../../services/insightsApi.js";

// ── Config ────────────────────────────────────────────────────────────────────

const ACTION_LABELS = {
  "user.login": "Login",
  "user.updated": "User Updated",
  "document.approved": "Doc Approved",
  "document.rejected": "Doc Rejected",
  "document.hold": "Doc On Hold",
  "document.pending": "Doc Pending",
  "email.sync": "Email Sync",
  "email.responder.run": "Email Responder",
  "sharepoint.sync": "SharePoint Sync"
};

const ENTITY_FILTERS = ["", "document", "user", "email_integration", "sharepoint_integration", "email_inbox_queries"];

// Maps each metric label to the backend detail type key
const METRIC_DETAIL_KEY = {
  "Top Cited Domain (30d)":    "top-domain",
  "Risky Answers This Week":   "risky-answers",
  "Most Used Source (30d)":    "top-source",
  "Coverage Gaps":             "coverage-gaps",
  "Avg Confidence (30d)":      "avg-confidence",
  "AI Resolution Rate (7d)":   "resolution-rate"
};

// Short tooltip shown inside the box so users know it's clickable
const METRIC_HINT = {
  "Top Cited Domain (30d)":    "Click to see domain citation breakdown",
  "Risky Answers This Week":   "Click to see low-confidence AI responses",
  "Most Used Source (30d)":    "Click to see most cited documents",
  "Coverage Gaps":             "Click to see knowledge coverage by domain",
  "Avg Confidence (30d)":      "Click to see daily confidence trend",
  "AI Resolution Rate (7d)":   "Click to see daily resolution breakdown"
};

// Color accent per metric for the active state
const METRIC_COLOR = {
  "Top Cited Domain (30d)":    "#0183c9",
  "Risky Answers This Week":   "#ef4444",
  "Most Used Source (30d)":    "#7c3aed",
  "Coverage Gaps":             "#f59e0b",
  "Avg Confidence (30d)":      "#059669",
  "AI Resolution Rate (7d)":   "#003a70"
};

const PAGE_SIZE = 50;

// ── Sub-components ────────────────────────────────────────────────────────────

function DetailTable({ detail, loading }) {
  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", opacity: 0.5, fontSize: "0.88rem" }}>
        Loading detail data…
      </div>
    );
  }

  if (!detail) return null;

  const { title, description, columns, rows } = detail;

  return (
    <div className="audit-detail-panel">
      <div className="audit-detail-header">
        <h4 className="audit-detail-title">{title}</h4>
        <p className="audit-detail-desc">{description}</p>
      </div>

      {rows.length === 0 ? (
        <p style={{ padding: "1rem", opacity: 0.55, fontSize: "0.85rem" }}>
          No data available yet — this will populate as users interact with the Budget Assistant.
        </p>
      ) : (
        <div className="queue-table" style={{ marginTop: "0.75rem" }}>
          <div className="queue-table-inner" style={{ minWidth: `${columns.length * 140}px` }}>
            <div
              className="queue-row queue-head"
              style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
            >
              {columns.map((col) => <span key={col}>{col}</span>)}
            </div>
            {rows.map((row, ri) => (
              <div
                key={ri}
                className="queue-row"
                style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)`, fontSize: "0.8rem" }}
              >
                {row.map((cell, ci) => (
                  <span
                    key={ci}
                    title={typeof cell === "string" && cell.length > 40 ? cell : undefined}
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {cell}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AuditPanel({ authToken }) {
  // Metrics + detail
  const [metrics, setMetrics] = useState([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [activeMetric, setActiveMetric] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Activity log
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [entityType, setEntityType] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);

  const [error, setError] = useState("");

  // Load metrics on mount
  useEffect(() => {
    if (!authToken) return;
    setMetricsLoading(true);
    getAuditMetrics(authToken)
      .then(({ metrics: data }) => setMetrics(data || []))
      .catch((err) => setError(err.message || "Unable to load audit metrics."))
      .finally(() => setMetricsLoading(false));
  }, [authToken]);

  // Load activity log whenever filters/page change
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

  // Load detail when a metric box is clicked
  const handleMetricClick = (metric) => {
    const key = METRIC_DETAIL_KEY[metric.label];
    if (!key) return;

    // Toggle off if clicking the same box again
    if (activeMetric === metric.label) {
      setActiveMetric(null);
      setDetail(null);
      return;
    }

    setActiveMetric(metric.label);
    setDetail(null);
    setDetailLoading(true);

    getAuditMetricDetail(authToken, key)
      .then(({ detail: d }) => setDetail(d))
      .catch(() => setDetail({ title: "Error", description: "Could not load detail.", columns: [], rows: [] }))
      .finally(() => setDetailLoading(false));
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const activeColor = activeMetric ? (METRIC_COLOR[activeMetric] || "#003a70") : "#003a70";

  return (
    <article className="panel active">
      <div className="panel-head">
        <h2>Citations &amp; Audit</h2>
        <p>Click any metric box to drill into the underlying data. Use the Activity Log below to filter by action or entity type.</p>
      </div>

      {error && <p className="section-caption" style={{ color: "#ef4444" }}>{error}</p>}

      {/* ── Metric boxes ──────────────────────────────────────────────────── */}
      {metricsLoading ? (
        <p className="section-caption">Loading metrics…</p>
      ) : (
        <div className="metric-grid">
          {metrics.map((metric) => {
            const isActive = activeMetric === metric.label;
            const color = METRIC_COLOR[metric.label] || "#003a70";
            const hint = METRIC_HINT[metric.label];
            const isClickable = Boolean(METRIC_DETAIL_KEY[metric.label]);

            return (
              <button
                key={metric.label}
                type="button"
                className={`metric audit-metric-btn${isActive ? " audit-metric-active" : ""}`}
                onClick={() => handleMetricClick(metric)}
                disabled={!isClickable}
                style={{
                  textAlign: "left",
                  cursor: isClickable ? "pointer" : "default",
                  borderColor: isActive ? color : undefined,
                  boxShadow: isActive ? `0 0 0 2px ${color}33, 0 4px 16px ${color}22` : undefined,
                  background: isActive ? `linear-gradient(135deg, ${color}0d, ${color}05)` : undefined,
                  transition: "border-color 0.18s, box-shadow 0.18s, background 0.18s"
                }}
              >
                <p className="metric-label" style={{ color: isActive ? color : undefined }}>
                  {metric.label}
                  {isActive && (
                    <span style={{ marginLeft: "6px", fontSize: "0.7em", opacity: 0.7 }}>▲ hide</span>
                  )}
                </p>
                <p
                  className="metric-value"
                  style={{ color: isActive ? color : undefined, fontSize: "1.15rem", marginBottom: "6px" }}
                >
                  {metric.value}
                </p>
                {hint && !isActive && (
                  <p style={{ margin: 0, fontSize: "0.7rem", color: "#6b7280", fontWeight: 400 }}>
                    {hint}
                  </p>
                )}
                {isActive && (
                  <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 500, color }}>
                    Showing detail below ↓
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Drill-down detail panel ────────────────────────────────────────── */}
      {(activeMetric || detailLoading) && (
        <section
          className="setup-card"
          style={{
            marginTop: "1.25rem",
            borderLeft: `3px solid ${activeColor}`,
            borderRadius: "0 12px 12px 0"
          }}
        >
          <DetailTable detail={detail} loading={detailLoading} />
        </section>
      )}

      {/* ── Activity log ──────────────────────────────────────────────────── */}
      <section className="setup-card" style={{ marginTop: "1.5rem" }}>
        <h3>Activity Log</h3>
        <p className="section-caption">
          All significant admin actions — logins, document decisions, sync events, and user management.
          Filter by entity type or action to narrow the view.
        </p>

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

        {/* Entity type legend — explains what each filter means */}
        {entityType && (
          <div className="audit-legend">
            {{
              document:              "Filtering actions on knowledge base documents — approvals, rejections, holds.",
              user:                  "Filtering user account actions — logins, profile updates, role changes.",
              email_integration:     "Filtering email mailbox configuration and sync events.",
              sharepoint_integration:"Filtering SharePoint connection and document sync events.",
              email_inbox_queries:   "Filtering inbound email queries handled by the Budget Agent responder."
            }[entityType] || ""}
          </div>
        )}

        {logsLoading && <p className="section-caption">Loading…</p>}

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

                {logs.length === 0 && (
                  <p className="empty-queue">
                    {actionFilter || entityType ? "No matching entries for the selected filters." : "No audit entries yet."}
                  </p>
                )}

                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="queue-row"
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
                        : log.action?.includes("sync") || log.action?.includes("responder") ? "pending"
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
