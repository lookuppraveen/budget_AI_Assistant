import { useEffect, useState } from "react";
import {
  createReport,
  downloadExecutivePack,
  getReports,
  getReportsSummary,
  runReport,
  scheduleReport
} from "../../services/insightsApi.js";

// ── Static config ─────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  {
    id: "budget-summary",
    label: "Budget Summary",
    icon: "📊",
    desc: "High-level overview of total budget allocations, spending to date, and remaining balances across all departments.",
    roles: ["Admin", "Budget Analyst", "Department Editor", "Read Only"],
  },
  {
    id: "department-budget",
    label: "Department Budget",
    icon: "🏢",
    desc: "Detailed breakdown of budget allocations, expenditures, and variances for each department.",
    roles: ["Admin", "Budget Analyst", "Department Editor", "Read Only"],
  },
  {
    id: "variance-analysis",
    label: "Variance Analysis",
    icon: "📉",
    desc: "Compares planned vs. actual spending to identify areas over or under budget.",
    roles: ["Admin", "Budget Analyst"],
  },
  {
    id: "board-report",
    label: "Board & Executive Report",
    icon: "📋",
    desc: "Governance-ready summary for board presentations, including key financial highlights.",
    roles: ["Admin", "Budget Analyst"],
  },
  {
    id: "ai-insights",
    label: "AI Usage & Insights",
    icon: "🤖",
    desc: "Tracks how the AI assistant is being used — top questions asked, answer confidence, and resolution rates.",
    roles: ["Admin", "Budget Analyst"],
  },
  {
    id: "compliance",
    label: "Compliance & Audit",
    icon: "✅",
    desc: "Documents budget policy adherence, flagged items, and audit trail entries.",
    roles: ["Admin"],
  },
];

const SCHEDULE_OPTIONS = [
  { label: "Every Monday morning", cron: "0 6 * * 1" },
  { label: "1st of every month", cron: "0 6 1 * *" },
  { label: "Every weekday morning", cron: "0 7 * * 1-5" },
  { label: "Every quarter (Jan, Apr, Jul, Oct)", cron: "0 6 1 1,4,7,10 *" },
  { label: "Custom (enter cron expression)", cron: "custom" },
];

const STATUS_CONFIG = {
  Ready:     { color: "#78ba21", bg: "#f4fce3", label: "Ready to View" },
  Draft:     { color: "#435263", bg: "#f5f7fb", label: "In Progress" },
  Scheduled: { color: "#0183c9", bg: "#e6f3fb", label: "Scheduled" },
  Failed:    { color: "#b32615", bg: "#fde8e6", label: "Failed" },
};

const EMPTY_MONTHLY = Array.from({ length: 6 }, (_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - 5 + i);
  return { label: d.toLocaleString("en-US", { month: "short" }), count: 0 };
});

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Draft;
  return (
    <span className="rp-status-badge" style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="rp-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rp-modal">
        <div className="rp-modal-header">
          <strong>{title}</strong>
          <button type="button" onClick={onClose} className="rp-modal-close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Simple animated bar chart using SVG
function MonthlyBarChart({ data }) {
  const values = data.map((d) => d.count);
  const labels = data.map((d) => d.label);
  const max = Math.max(...values, 1);
  const hasData = values.some((v) => v > 0);
  const barW = 52;
  const gap = 18;
  const chartH = 120;
  const totalW = data.length * (barW + gap);

  return (
    <div>
      <svg viewBox={`0 0 ${totalW} ${chartH + 30}`} className="rp-bar-chart" role="img" aria-label="Monthly reports chart">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0183c9" />
            <stop offset="100%" stopColor="#003a70" />
          </linearGradient>
          <linearGradient id="barEmpty" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d8dfe2" />
            <stop offset="100%" stopColor="#eef2f7" />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const barH = hasData ? Math.max(4, (d.count / max) * chartH) : 12;
          const x = i * (barW + gap);
          const y = chartH - barH;
          return (
            <g key={d.label}>
              <rect
                x={x} y={y} width={barW} height={barH} rx="6"
                fill={d.count > 0 ? "url(#barGrad)" : "url(#barEmpty)"}
                className="rp-bar-animated"
              />
              <text x={x + barW / 2} y={chartH + 16} textAnchor="middle" className="rp-axis-label">{d.label}</text>
              {d.count > 0 && (
                <text x={x + barW / 2} y={y - 5} textAnchor="middle" className="rp-bar-value">{d.count}</text>
              )}
            </g>
          );
        })}
      </svg>
      {!hasData && (
        <p className="rp-chart-no-data">No reports generated yet — create your first report to see activity here.</p>
      )}
    </div>
  );
}

// Animated live donut chart
function StatusDonut({ status, total }) {
  const { Ready = 0, Draft = 0, Scheduled = 0, Failed = 0 } = status || {};
  const segments = [
    { key: "Ready",     value: Ready,     color: "#78ba21", label: "Ready" },
    { key: "Scheduled", value: Scheduled, color: "#0183c9", label: "Scheduled" },
    { key: "Draft",     value: Draft,     color: "#435263", label: "In Progress" },
    { key: "Failed",    value: Failed,    color: "#b32615", label: "Failed" },
  ].filter((s) => s.value > 0);

  const r = 54; const cx = 70; const cy = 70; const stroke = 18;
  const circ = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <div className="rp-donut-container">
      <svg viewBox="0 0 140 140" className="rp-donut-svg">
        {/* Track ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#d8dfe2" strokeWidth={stroke} strokeDasharray={`${circ * 0.9} ${circ * 0.1}`} strokeDashoffset={circ * 0.05} transform={`rotate(-90 ${cx} ${cy})`} />
        ) : segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          const dashLen = (pct / 100) * circ;
          const offset = circ - (cumulative / 100) * circ;
          cumulative += pct;
          return (
            <circle
              key={seg.key}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${dashLen} ${circ - dashLen}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              className="rp-donut-segment"
            />
          );
        })}
        <text x={cx} y={cy - 8} textAnchor="middle" className="rp-donut-num">{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="rp-donut-sub">Total</text>
        <text x={cx} y={cy + 24} textAnchor="middle" className="rp-donut-sub">Reports</text>
      </svg>
      {/* Percentage callouts */}
      {total > 0 && (
        <div className="rp-donut-callouts">
          {segments.map((seg) => (
            <div key={seg.key} className="rp-donut-callout">
              <span className="rp-donut-callout-pct" style={{ color: seg.color }}>
                {Math.round((seg.value / total) * 100)}%
              </span>
              <span className="rp-donut-callout-label">{seg.label}</span>
            </div>
          ))}
        </div>
      )}
      {total === 0 && (
        <p className="rp-chart-no-data">No reports yet — create one to see the breakdown here.</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportsPanel({ authToken, user }) {
  const role = user?.role || "Read Only";
  const [activeTab, setActiveTab] = useState("overview");
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("budget-summary");
  const [newFreq, setNewFreq] = useState("Monthly");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // schedule modal
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduleOption, setScheduleOption] = useState(SCHEDULE_OPTIONS[0].cron);
  const [customCron, setCustomCron] = useState("0 6 * * 1");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState("");

  const [runningId, setRunningId] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const canEdit = ["Admin", "Budget Analyst"].includes(role);
  const allowedTypes = REPORT_TYPES.filter((t) => t.roles.includes(role));

  async function load() {
    try {
      setLoading(true);
      const [reportsRes, summaryRes] = await Promise.all([
        getReports(authToken),
        getReportsSummary(authToken),
      ]);
      setReports(reportsRes.reports || []);
      setSummary(summaryRes.summary || null);
    } catch {
      setError("Unable to load reports. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (authToken) load(); }, [authToken]);

  const handleCreate = async () => {
    if (!newName.trim()) { setCreateError("Please enter a report name."); return; }
    setCreating(true); setCreateError("");
    try {
      const typeLabel = REPORT_TYPES.find((t) => t.id === newType)?.label || newType;
      const res = await createReport(authToken, { reportName: newName.trim(), frequency: newFreq, type: typeLabel });
      setReports((prev) => [res.report, ...prev]);
      setShowCreate(false); setNewName(""); setNewType("budget-summary"); setNewFreq("Monthly");
    } catch (err) {
      setCreateError(err.message || "Failed to create report.");
    } finally {
      setCreating(false);
    }
  };

  const handleRun = async (reportId) => {
    setRunningId(reportId);
    try {
      const res = await runReport(authToken, reportId);
      setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, ...res.report } : r));
    } catch {
      setError("Could not run report. Try again.");
    } finally {
      setRunningId(null);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleTarget) return;
    const cron = scheduleOption === "custom" ? customCron : scheduleOption;
    setScheduling(true); setScheduleError("");
    try {
      await scheduleReport(authToken, scheduleTarget.id, cron);
      setReports((prev) => prev.map((r) => r.id === scheduleTarget.id ? { ...r, status: "Scheduled", scheduleCron: cron } : r));
      setShowSchedule(false);
    } catch (err) {
      setScheduleError(err.message || "Could not save schedule.");
    } finally {
      setScheduling(false);
    }
  };

  const handleDownload = async (format) => {
    setDownloading(true);
    try { await downloadExecutivePack(authToken, format); }
    catch { setError("Download failed. Try again."); }
    finally { setDownloading(false); }
  };

  const openSchedule = (report) => {
    setScheduleTarget({ id: report.id, name: report.name });
    setScheduleOption(report.scheduleCron || SCHEDULE_OPTIONS[0].cron);
    setCustomCron(report.scheduleCron || "0 6 * * 1");
    setScheduleError("");
    setShowSchedule(true);
  };

  // Use live counts from the DB summary; fall back to frontend computation
  const liveStatus = summary?.status || {
    Ready:     reports.filter((r) => r.status === "Ready").length,
    Draft:     reports.filter((r) => r.status === "Draft").length,
    Scheduled: reports.filter((r) => r.status === "Scheduled").length,
    Failed:    reports.filter((r) => r.status === "Failed").length,
  };

  const monthlyData = summary?.monthly || EMPTY_MONTHLY;
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const handleRefresh = async () => {
    setLastRefreshed(new Date());
    await load();
  };

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "my-reports", label: `My Reports${reports.length ? ` (${reports.length})` : ""}` },
    { id: "report-types", label: "Available Reports" },
  ];

  if (loading) {
    return <article className="panel active"><p className="section-caption">Loading reports...</p></article>;
  }

  return (
    <article className="panel active">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="rp-header">
        <div className="rp-header-left">
          <h2 className="rp-title">Reports Center</h2>
          <p className="rp-subtitle">
            {role === "Admin" && "Generate, schedule, and export budget reports across all departments."}
            {role === "Budget Analyst" && "Access budget analysis, variance reports, and board-ready summaries."}
            {role === "Department Editor" && "View and generate reports for your department's budget activity."}
            {role === "Read Only" && "Browse available budget reports and summaries."}
          </p>
        </div>
        <div className="rp-header-actions">
          {canEdit && (
            <button type="button" className="rp-btn-primary" onClick={() => { setCreateError(""); setShowCreate(true); }}>
              + Create Report
            </button>
          )}
          <button type="button" className="rp-btn-secondary" onClick={() => handleDownload("xlsx")} disabled={downloading}>
            {downloading ? "Downloading…" : "⬇ Export All"}
          </button>
        </div>
      </div>

      {error && <div className="rp-error">{error}</div>}

      {/* ── KPI strip ──────────────────────────────────────────── */}
      <div className="rp-kpi-strip">
        <div className="rp-kpi"><span className="rp-kpi-num">{reports.length}</span><span className="rp-kpi-label">Total Reports</span></div>
        <div className="rp-kpi rp-kpi-green"><span className="rp-kpi-num">{liveStatus.Ready}</span><span className="rp-kpi-label">Ready to View</span></div>
        <div className="rp-kpi rp-kpi-blue"><span className="rp-kpi-num">{liveStatus.Scheduled}</span><span className="rp-kpi-label">Scheduled</span></div>
        <div className="rp-kpi rp-kpi-gray"><span className="rp-kpi-num">{liveStatus.Draft}</span><span className="rp-kpi-label">In Progress</span></div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="rp-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`rp-tab ${activeTab === t.id ? "rp-tab-active" : ""}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════
          TAB: OVERVIEW
          ════════════════════════════════════════════════════��═══ */}
      {activeTab === "overview" && (
        <div className="rp-grid-2">

          {/* Monthly activity chart — live from DB */}
          <div className="rp-card">
            <div className="rp-card-header-row">
              <div>
                <h3 className="rp-card-title">Reports Generated Per Month</h3>
                <p className="rp-card-desc">Actual reports created each month — last 6 months</p>
              </div>
              <button type="button" className="rp-refresh-btn" onClick={handleRefresh} title="Refresh data">
                ↻ Refresh
              </button>
            </div>
            <MonthlyBarChart data={monthlyData} />
            {monthlyData.some((d) => d.count > 0) && (
              <div className="rp-chart-footer">
                <span>Total this period: <strong>{monthlyData.reduce((a, d) => a + d.count, 0)}</strong></span>
                <span>Monthly avg: <strong>{Math.round(monthlyData.reduce((a, d) => a + d.count, 0) / monthlyData.length)}</strong></span>
                <span className="rp-refreshed-at">Updated {lastRefreshed.toLocaleTimeString()}</span>
              </div>
            )}
          </div>

          {/* Status overview — live from DB summary */}
          <div className="rp-card">
            <div className="rp-card-header-row">
              <div>
                <h3 className="rp-card-title">Report Status Overview</h3>
                <p className="rp-card-desc">Live breakdown of all report statuses from the database</p>
              </div>
            </div>
            <div className="rp-donut-row">
              <StatusDonut status={liveStatus} total={reports.length} />
              <div className="rp-donut-legend">
                <div className="rp-legend-item"><span className="rp-legend-dot" style={{ background: "#78ba21" }} /><span>Ready to View</span><strong>{liveStatus.Ready}</strong></div>
                <div className="rp-legend-item"><span className="rp-legend-dot" style={{ background: "#0183c9" }} /><span>Scheduled</span><strong>{liveStatus.Scheduled}</strong></div>
                <div className="rp-legend-item"><span className="rp-legend-dot" style={{ background: "#435263" }} /><span>In Progress</span><strong>{liveStatus.Draft}</strong></div>
                <div className="rp-legend-item"><span className="rp-legend-dot" style={{ background: "#b32615" }} /><span>Failed</span><strong>{liveStatus.Failed ?? 0}</strong></div>
              </div>
            </div>
          </div>

          {/* Report coverage */}
          <div className="rp-card rp-card-wide">
            <h3 className="rp-card-title">Report Coverage by Category</h3>
            <p className="rp-card-desc">How many reports exist per budget report type</p>
            <div className="rp-coverage-list">
              {REPORT_TYPES.filter((t) => t.roles.includes(role)).map((type) => {
                const count = reports.filter((r) => r.type === type.label || r.name?.toLowerCase().includes(type.id)).length;
                const pct = reports.length ? Math.round((count / reports.length) * 100) : 0;
                return (
                  <div key={type.id} className="rp-coverage-row">
                    <span className="rp-coverage-icon">{type.icon}</span>
                    <span className="rp-coverage-label">{type.label}</span>
                    <div className="rp-coverage-bar-wrap">
                      <div className="rp-coverage-bar" style={{ width: `${Math.max(pct, reports.length ? 0 : 12)}%` }} />
                    </div>
                    <span className="rp-coverage-count">{count} report{count !== 1 ? "s" : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upcoming scheduled */}
          <div className="rp-card">
            <h3 className="rp-card-title">Upcoming Scheduled Reports</h3>
            <p className="rp-card-desc">Reports set to run automatically</p>
            {reports.filter((r) => r.status === "Scheduled").length === 0 ? (
              <div className="rp-empty-state">
                <span>📅</span>
                <p>No reports scheduled yet.</p>
                {canEdit && <p>Open "My Reports" and click "Set Schedule" on any report.</p>}
              </div>
            ) : (
              <div className="rp-schedule-list">
                {reports.filter((r) => r.status === "Scheduled").map((r) => (
                  <div key={r.id} className="rp-schedule-item">
                    <div className="rp-schedule-icon">📅</div>
                    <div>
                      <p className="rp-schedule-name">{r.name}</p>
                      <p className="rp-schedule-cron">{r.scheduleCron || "Scheduled"}</p>
                    </div>
                    <StatusBadge status="Scheduled" />
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: MY REPORTS
          ════════════════════════════════════════════════════════ */}
      {activeTab === "my-reports" && (
        <div>
          {reports.length === 0 ? (
            <div className="rp-empty-full">
              <span className="rp-empty-icon">📊</span>
              <h3>No reports yet</h3>
              <p>Create your first report to see it here.</p>
              {canEdit && (
                <button type="button" className="rp-btn-primary" onClick={() => { setCreateError(""); setShowCreate(true); }}>
                  + Create Your First Report
                </button>
              )}
            </div>
          ) : (
            <div className="rp-reports-grid">
              {reports.map((report) => {
                const typeInfo = REPORT_TYPES.find((t) => t.label === report.type || t.id === report.type) || REPORT_TYPES[0];
                return (
                  <div key={report.id} className="rp-report-card">
                    <div className="rp-report-card-top">
                      <span className="rp-report-icon">{typeInfo.icon}</span>
                      <StatusBadge status={report.status} />
                    </div>
                    <h4 className="rp-report-name">{report.name}</h4>
                    <p className="rp-report-meta">
                      <span>{report.frequency || "On-Demand"}</span>
                      {report.owner && <span>· {report.owner}</span>}
                      {report.updatedAt && <span>· Updated {new Date(report.updatedAt).toLocaleDateString()}</span>}
                    </p>
                    <p className="rp-report-desc">{typeInfo.desc}</p>
                    <div className="rp-report-actions">
                      {canEdit && (
                        <button
                          type="button"
                          className="rp-btn-run"
                          disabled={runningId === report.id}
                          onClick={() => handleRun(report.id)}
                        >
                          {runningId === report.id ? "Running…" : "▶ Run Now"}
                        </button>
                      )}
                      {canEdit && (
                        <button type="button" className="rp-btn-outline" onClick={() => openSchedule(report)}>
                          {report.scheduleCron ? "✎ Reschedule" : "📅 Set Schedule"}
                        </button>
                      )}
                      <button type="button" className="rp-btn-outline" onClick={() => handleDownload("xlsx")} disabled={downloading}>
                        ⬇ Download
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: AVAILABLE REPORT TYPES
          ════════════════════════════════════════════════════════ */}
      {activeTab === "report-types" && (
        <div>
          <p className="rp-section-intro">
            Below are the report types available for your role. Click <strong>Create</strong> to generate a new report of that type.
          </p>
          <div className="rp-types-grid">
            {allowedTypes.map((type) => (
              <div key={type.id} className="rp-type-card">
                <div className="rp-type-icon">{type.icon}</div>
                <div className="rp-type-body">
                  <h4 className="rp-type-name">{type.label}</h4>
                  <p className="rp-type-desc">{type.desc}</p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    className="rp-btn-primary rp-type-btn"
                    onClick={() => {
                      setNewType(type.id);
                      setNewName(type.label);
                      setCreateError("");
                      setShowCreate(true);
                    }}
                  >
                    + Create
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Create Report Modal ────────────────────────────────── */}
      {showCreate && (
        <Modal title="Create New Report" onClose={() => setShowCreate(false)}>
          <div className="rp-form-field">
            <label>Report Name</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Q2 Department Budget Summary" autoFocus />
          </div>
          <div className="rp-form-field">
            <label>Report Type</label>
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              {allowedTypes.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
            </select>
            <p className="rp-form-hint">{REPORT_TYPES.find((t) => t.id === newType)?.desc}</p>
          </div>
          <div className="rp-form-field">
            <label>How often should this report run?</label>
            <select value={newFreq} onChange={(e) => setNewFreq(e.target.value)}>
              {["On-Demand", "Daily", "Weekly", "Monthly", "Quarterly"].map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          {createError && <p className="rp-form-error">{createError}</p>}
          <div className="rp-modal-footer">
            <button type="button" className="rp-btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Create Report"}
            </button>
            <button type="button" className="rp-btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* ── Schedule Modal ─────────────────────────────────────── */}
      {showSchedule && scheduleTarget && (
        <Modal title={`Schedule: ${scheduleTarget.name}`} onClose={() => setShowSchedule(false)}>
          <p className="rp-modal-intro">Choose when this report should run automatically.</p>
          <div className="rp-form-field">
            <label>Run schedule</label>
            <select value={scheduleOption} onChange={(e) => setScheduleOption(e.target.value)}>
              {SCHEDULE_OPTIONS.map((opt) => (
                <option key={opt.cron} value={opt.cron}>{opt.label}</option>
              ))}
            </select>
          </div>
          {scheduleOption === "custom" && (
            <div className="rp-form-field">
              <label>Custom cron expression</label>
              <input type="text" value={customCron} onChange={(e) => setCustomCron(e.target.value)} placeholder="0 6 * * 1" />
              <p className="rp-form-hint">Format: minute hour day month weekday. Example: <code>0 6 * * 1</code> = every Monday at 6 AM</p>
            </div>
          )}
          {scheduleError && <p className="rp-form-error">{scheduleError}</p>}
          <div className="rp-modal-footer">
            <button type="button" className="rp-btn-primary" onClick={handleSchedule} disabled={scheduling}>
              {scheduling ? "Saving…" : "Save Schedule"}
            </button>
            <button type="button" className="rp-btn-ghost" onClick={() => setShowSchedule(false)}>Cancel</button>
          </div>
        </Modal>
      )}

    </article>
  );
}
