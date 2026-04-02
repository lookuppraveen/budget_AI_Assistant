import { useEffect, useState } from "react";
import {
  createReport,
  downloadExecutivePack,
  getReports,
  getReportsSummary,
  runReport,
  scheduleReport
} from "../../services/insightsApi.js";

const FREQUENCIES = ["Daily", "Weekly", "Monthly", "Quarterly", "On-Demand"];

const defaultSummary = {
  status: { Ready: 0, Draft: 0, Scheduled: 0, Failed: 0 },
  slaMetrics: [],
  matrixCols: ["Policies", "Procedures", "History", "Training"],
  completenessMatrix: [],
  timeline: []
};

// ── tiny inline modal ────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--surface, #1e293b)", borderRadius: "0.75rem",
        padding: "1.75rem", minWidth: "340px", maxWidth: "480px", width: "100%",
        border: "1px solid var(--border, #334155)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <strong style={{ fontSize: "1rem" }}>{title}</strong>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.25rem", color: "inherit" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ReportsPanel({ authToken }) {
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState(defaultSummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState(null); // { id, name }

  // create form
  const [newName, setNewName] = useState("");
  const [newFreq, setNewFreq] = useState("Monthly");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // schedule form
  const [cronExpr, setCronExpr] = useState("0 6 * * 1");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState("");

  // per-row run state
  const [runningId, setRunningId] = useState(null);
  const [runError, setRunError] = useState("");

  // download state
  const [downloading, setDownloading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const [reportsRes, summaryRes] = await Promise.all([
        getReports(authToken),
        getReportsSummary(authToken)
      ]);
      setReports(reportsRes.reports || []);
      setSummary(summaryRes.summary || defaultSummary);
    } catch (loadError) {
      setError(loadError.message || "Unable to load reports data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authToken) load();
  }, [authToken]);

  // ── Create New Report ──────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newName.trim()) { setCreateError("Report name is required."); return; }
    setCreating(true);
    setCreateError("");
    try {
      const res = await createReport(authToken, { reportName: newName.trim(), frequency: newFreq });
      setReports((prev) => [res.report, ...prev]);
      setShowCreate(false);
      setNewName("");
      setNewFreq("Monthly");
    } catch (err) {
      setCreateError(err.message || "Failed to create report.");
    } finally {
      setCreating(false);
    }
  };

  // ── Run a report ───────────────────────────────────────────────────────────
  const handleRun = async (reportId) => {
    setRunningId(reportId);
    setRunError("");
    try {
      const res = await runReport(authToken, reportId);
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, ...res.report } : r)));
      // Refresh summary SLA panels after a run
      const summaryRes = await getReportsSummary(authToken);
      setSummary(summaryRes.summary || defaultSummary);
    } catch (err) {
      setRunError(err.message || "Run failed.");
    } finally {
      setRunningId(null);
    }
  };

  // ── Schedule Batch Export ──────────────────────────────────────────────────
  const handleSchedule = async () => {
    if (!scheduleTarget) return;
    setScheduling(true);
    setScheduleError("");
    try {
      await scheduleReport(authToken, scheduleTarget.id, cronExpr);
      setReports((prev) =>
        prev.map((r) => (r.id === scheduleTarget.id ? { ...r, status: "Scheduled", scheduleCron: cronExpr } : r))
      );
      setShowSchedule(false);
    } catch (err) {
      setScheduleError(err.message || "Scheduling failed.");
    } finally {
      setScheduling(false);
    }
  };

  const openScheduleModal = (report) => {
    setScheduleTarget({ id: report.id, name: report.name });
    setCronExpr(report.scheduleCron || "0 6 * * 1");
    setScheduleError("");
    setShowSchedule(true);
  };

  // ── Download Executive Pack ────────────────────────────────────────────────
  const handleDownload = async (format = "txt") => {
    setDownloading(true);
    try {
      await downloadExecutivePack(authToken, format);
    } catch (err) {
      setError(err.message || "Download failed.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <article className="panel active"><p className="section-caption">Loading reports...</p></article>;
  }

  return (
    <article className="panel active">
      <div className="panel-head">
        <h2>Reports Center</h2>
        <p>Design-quality reporting cockpit with readiness, SLA health, completeness map, and schedule timeline.</p>
      </div>

      {error && <p className="section-caption" style={{ color: "var(--danger, #ef4444)" }}>{error}</p>}
      {runError && <p className="section-caption" style={{ color: "var(--danger, #ef4444)" }}>{runError}</p>}

      <section className="report-actions">
        <button type="button" className="action-btn" onClick={() => { setCreateError(""); setShowCreate(true); }}>
          Create New Report
        </button>
        <button
          type="button"
          className="action-btn"
          onClick={() => {
            const first = reports[0];
            if (first) openScheduleModal(first);
            else setError("Create a report first before scheduling.");
          }}
        >
          Schedule Batch Export
        </button>
        <button type="button" className="action-btn" onClick={() => handleDownload("txt")} disabled={downloading}>
          {downloading ? "Downloading..." : "Download Pack (TXT)"}
        </button>
        <button type="button" className="action-btn" onClick={() => handleDownload("xlsx")} disabled={downloading}>
          {downloading ? "Downloading..." : "Download Pack (Excel)"}
        </button>
      </section>

      <section className="dash-grid charts-2up">
        <div className="dash-card chart-card">
          <h3>Report Status Donut</h3>
          <div className="donut-wrap">
            <div className="report-donut" />
            <div className="donut-center">
              <strong>{reports.length}</strong>
              <p>Total Runs</p>
            </div>
          </div>
          <div className="legend-col">
            <span><i className="dot" style={{ background: "#16a34a" }} /> Ready: {summary.status.Ready}</span>
            <span><i className="dot" style={{ background: "#64748b" }} /> Draft: {summary.status.Draft}</span>
            <span><i className="dot" style={{ background: "#0284c7" }} /> Scheduled: {summary.status.Scheduled}</span>
          </div>
        </div>

        <div className="dash-card chart-card">
          <h3>SLA Bullet Chart</h3>
          <div className="sla-list">
            {summary.slaMetrics.map((item) => (
              <div key={item.label} className="sla-row">
                <p>{item.label}</p>
                <div className="sla-track">
                  <div className="sla-fill" style={{ width: `${item.actual}%` }} />
                  <span className="sla-target" style={{ left: `${item.target}%` }} />
                </div>
                <strong>{item.actual}%</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="dash-grid charts-2up">
        <div className="dash-card">
          <h3>Completeness Heatmap (Dept x Domain)</h3>
          <div className="matrix-grid matrix-head">
            <span>Department</span>
            {summary.matrixCols.map((column) => (
              <span key={column}>{column}</span>
            ))}
          </div>
          {summary.completenessMatrix.map((row) => (
            <div className="matrix-grid" key={row.dept}>
              <span className="matrix-label">{row.dept}</span>
              {row.values.map((value, index) => (
                <span key={`${row.dept}-${index}`} className={`matrix-cell lv-${value}`} />
              ))}
            </div>
          ))}
        </div>

        <div className="dash-card">
          <h3>Report Schedule Timeline</h3>
          <div className="timeline-list">
            {summary.timeline.map((item, i) => (
              <div key={`${item.time}-${i}`} className={`timeline-item ${item.stage}`}>
                <div className="timeline-dot" />
                <div>
                  <p>{item.time}</p>
                  <strong>{item.title}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="setup-card">
        <h3>Generated Reports</h3>
        <div className="queue-table">
          <div className="queue-table-inner" style={{ minWidth: "700px" }}>
          <div className="queue-row queue-head reports-head" style={{ gridTemplateColumns: "80px minmax(180px,2fr) minmax(120px,1fr) minmax(100px,1fr) 90px 70px 100px" }}>
            <span>ID</span>
            <span>Report Name</span>
            <span>Owner</span>
            <span>Frequency</span>
            <span>Status</span>
            <span>Run</span>
            <span>Schedule</span>
          </div>
          {reports.length === 0 && <p className="empty-queue">No reports yet. Create one above.</p>}
          {reports.map((report) => (
            <div className="queue-row reports-row" key={report.id} style={{ gridTemplateColumns: "80px minmax(180px,2fr) minmax(120px,1fr) minmax(100px,1fr) 90px 70px 100px" }}>
              <span title={report.id}>{String(report.id).slice(0, 8)}</span>
              <span>{report.name}</span>
              <span>{report.owner}</span>
              <span>{report.frequency}</span>
              <span>
                <span className={`status-chip ${String(report.status).toLowerCase()}`}>{report.status}</span>
              </span>
              <button
                type="button"
                className="action-btn"
                style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                disabled={runningId === report.id}
                onClick={() => handleRun(report.id)}
              >
                {runningId === report.id ? "Running…" : "Run"}
              </button>
              <button
                type="button"
                className="action-btn"
                style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                onClick={() => openScheduleModal(report)}
              >
                {report.scheduleCron ? "Re-schedule" : "Schedule"}
              </button>
            </div>
          ))}
          </div>
        </div>
      </section>

      {/* ── Create Report Modal ── */}
      {showCreate && (
        <Modal title="Create New Report" onClose={() => setShowCreate(false)}>
          <label className="field" style={{ marginBottom: "1rem" }}>
            <span>Report Name</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Monthly Budget Summary"
              autoFocus
            />
          </label>
          <label className="field" style={{ marginBottom: "1.25rem" }}>
            <span>Frequency</span>
            <select value={newFreq} onChange={(e) => setNewFreq(e.target.value)}>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          {createError && <p style={{ color: "var(--danger, #ef4444)", marginBottom: "0.75rem", fontSize: "0.85rem" }}>{createError}</p>}
          <div className="inline-actions">
            <button type="button" className="action-btn" onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create Report"}
            </button>
            <button type="button" className="action-btn" style={{ opacity: 0.6 }} onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── Schedule Modal ── */}
      {showSchedule && scheduleTarget && (
        <Modal title={`Schedule: ${scheduleTarget.name}`} onClose={() => setShowSchedule(false)}>
          <p style={{ fontSize: "0.85rem", marginBottom: "1rem", opacity: 0.75 }}>
            Enter a cron expression. Example: <code>0 6 * * 1</code> = every Monday 06:00.
          </p>
          <label className="field" style={{ marginBottom: "1.25rem" }}>
            <span>Cron Expression</span>
            <input
              type="text"
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="0 6 * * 1"
              autoFocus
            />
          </label>
          {scheduleError && <p style={{ color: "var(--danger, #ef4444)", marginBottom: "0.75rem", fontSize: "0.85rem" }}>{scheduleError}</p>}
          <div className="inline-actions">
            <button type="button" className="action-btn" onClick={handleSchedule} disabled={scheduling}>
              {scheduling ? "Saving..." : "Save Schedule"}
            </button>
            <button type="button" className="action-btn" style={{ opacity: 0.6 }} onClick={() => setShowSchedule(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </article>
  );
}
