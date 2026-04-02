import { useEffect, useState } from "react";
import { getDepartments } from "../../services/adminApi.js";
import {
  deleteManualReport,
  downloadManualReport,
  generateReport,
  listManualReports
} from "../../services/manualReportsApi.js";

const REPORT_TYPES = [
  "Board Summary",
  "Tax Filing Summary",
  "Department Budget Report",
  "Policy Compliance Report",
  "Fiscal Year Review",
  "Audit Trail Report",
  "Custom Report"
];

const DOMAINS = [
  "Budget Policies",
  "Budget Procedures",
  "Historical Budgets",
  "Budget Training Materials",
  "Board Presentations",
  "Department Requests",
  "Budget Manager Correspondence",
  "Calendar & Deadlines",
  "Revenue Assumptions"
];

const FISCAL_YEARS = ["FY27", "FY26", "FY25", "FY24", "FY23"];

const STATUS_COLOR = {
  Ready: "#16a34a",
  Generating: "#d97706",
  Failed: "#dc2626"
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function wordCountLabel(n) {
  if (!n) return "";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k words` : `${n} words`;
}

const defaultForm = {
  title: "",
  reportType: "Board Summary",
  domain: "",
  departmentId: "",
  departmentName: "",
  fiscalYear: "",
  dateFrom: "",
  dateTo: "",
  additionalNotes: "",
  format: "txt"
};

export default function ManualReportsPanel({ authToken, userRole, userDepartmentId }) {
  const [form, setForm] = useState(defaultForm);
  const [departments, setDepartments] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  // Generated report preview
  const [preview, setPreview] = useState(null);

  // Past reports list
  const [reports, setReports] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const SCOPED = userRole === "Department Editor" || userRole === "Read Only";

  // Load departments for filter dropdown
  useEffect(() => {
    if (!authToken) return;
    getDepartments(authToken)
      .then(({ departments: list }) => {
        setDepartments(list || []);
        // Auto-scope dept for restricted roles
        if (SCOPED && userDepartmentId && list?.length) {
          const dept = list.find((d) => d.id === userDepartmentId);
          if (dept) {
            setForm((f) => ({ ...f, departmentId: String(dept.id), departmentName: dept.name }));
          }
        }
      })
      .catch(() => {});
  }, [authToken]);

  // Load past reports
  useEffect(() => {
    if (!authToken) return;
    setListLoading(true);
    listManualReports(authToken)
      .then(({ reports: list }) => setReports(list || []))
      .catch(() => {})
      .finally(() => setListLoading(false));
  }, [authToken]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleDeptChange = (e) => {
    const id = e.target.value;
    const dept = departments.find((d) => String(d.id) === id);
    setForm((f) => ({
      ...f,
      departmentId: id,
      departmentName: dept ? dept.name : ""
    }));
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setGenError("Please enter a report title."); return; }
    setGenError("");
    setGenerating(true);
    setPreview(null);
    try {
      const payload = {
        ...form,
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
        dateFrom: form.dateFrom || undefined,
        dateTo: form.dateTo || undefined,
        domain: form.domain || undefined,
        fiscalYear: form.fiscalYear || undefined,
        additionalNotes: form.additionalNotes || undefined
      };
      const { report } = await generateReport(authToken, payload);
      setPreview(report);
      // Prepend to list
      setReports((prev) => [
        {
          id: report.id,
          title: report.title,
          reportType: report.reportType,
          status: report.status,
          format: report.format,
          wordCount: report.wordCount,
          sourcesUsed: report.sourcesUsed,
          createdAt: new Date().toISOString(),
          generatedBy: "You"
        },
        ...prev
      ]);
    } catch (err) {
      setGenError(err.message || "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (reportId, title, format) => {
    setDownloadingId(reportId);
    try {
      await downloadManualReport(authToken, reportId, title, format);
    } catch (err) {
      alert(err.message || "Download failed.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (reportId) => {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    setDeletingId(reportId);
    try {
      await deleteManualReport(authToken, reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      if (preview?.id === reportId) setPreview(null);
    } catch (err) {
      alert(err.message || "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <article className="panel active">
      <div className="panel-head">
        <h2>Manual Reports</h2>
        <p>
          Generate AI-powered reports from your approved knowledge base — ready for board meetings,
          tax filings, audits, and departmental reviews.
        </p>
      </div>

      <div className="mr-layout">
        {/* ── LEFT: Configuration form ──────────────────────────────── */}
        <div className="mr-left">
          <section className="setup-card">
            <h3>Configure Report</h3>
            <form onSubmit={handleGenerate}>

              {/* Report Title */}
              <div className="config-grid" style={{ marginTop: "14px" }}>
                <label className="field">
                  <span>Report Title *</span>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setField("title", e.target.value)}
                    placeholder="e.g. FY26 Board Budget Summary"
                    maxLength={200}
                  />
                </label>
              </div>

              {/* Report Type */}
              <div className="config-grid" style={{ marginTop: "10px" }}>
                <label className="field">
                  <span>Report Type *</span>
                  <select value={form.reportType} onChange={(e) => setField("reportType", e.target.value)}>
                    {REPORT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Report type description */}
              <p className="mr-type-hint">{getTypeHint(form.reportType)}</p>

              <div className="config-grid two-col" style={{ marginTop: "10px" }}>
                {/* Department */}
                <label className="field">
                  <span>Department</span>
                  <select
                    value={form.departmentId}
                    onChange={handleDeptChange}
                    disabled={SCOPED}
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={String(d.id)}>{d.name}</option>
                    ))}
                  </select>
                </label>

                {/* Domain */}
                <label className="field">
                  <span>Domain</span>
                  <select value={form.domain} onChange={(e) => setField("domain", e.target.value)}>
                    <option value="">All Domains</option>
                    {DOMAINS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </label>

                {/* Fiscal Year */}
                <label className="field">
                  <span>Fiscal Year</span>
                  <select value={form.fiscalYear} onChange={(e) => setField("fiscalYear", e.target.value)}>
                    <option value="">All Years</option>
                    {FISCAL_YEARS.map((fy) => (
                      <option key={fy} value={fy}>{fy}</option>
                    ))}
                  </select>
                </label>

                {/* Format */}
                <label className="field">
                  <span>Download Format</span>
                  <select value={form.format} onChange={(e) => setField("format", e.target.value)}>
                    <option value="txt">Plain Text (.txt)</option>
                    <option value="docx">Word Document (.docx)</option>
                  </select>
                </label>

                {/* Date From */}
                <label className="field">
                  <span>Documents From</span>
                  <input
                    type="date"
                    value={form.dateFrom}
                    onChange={(e) => setField("dateFrom", e.target.value)}
                  />
                </label>

                {/* Date To */}
                <label className="field">
                  <span>Documents To</span>
                  <input
                    type="date"
                    value={form.dateTo}
                    onChange={(e) => setField("dateTo", e.target.value)}
                  />
                </label>
              </div>

              {/* Additional Notes */}
              <label className="field" style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
                <span>Additional Guidance for AI (optional)</span>
                <textarea
                  className="mr-textarea"
                  value={form.additionalNotes}
                  onChange={(e) => setField("additionalNotes", e.target.value)}
                  placeholder="e.g. Focus on capital expenditures. Include carryforward policy. Write for a non-technical board audience."
                  rows={3}
                  maxLength={1000}
                />
              </label>

              {genError && (
                <p className="mr-error">{genError}</p>
              )}

              <div className="inline-actions" style={{ marginTop: "14px" }}>
                <button
                  type="submit"
                  className="action-btn"
                  disabled={generating}
                  style={{ minWidth: "160px" }}
                >
                  {generating ? (
                    <>
                      <span className="mr-spinner" /> Generating…
                    </>
                  ) : (
                    "Generate Report"
                  )}
                </button>
                <button
                  type="button"
                  className="action-btn"
                  style={{ opacity: 0.6 }}
                  onClick={() => { setForm(defaultForm); setPreview(null); setGenError(""); }}
                >
                  Reset
                </button>
              </div>
            </form>
          </section>

          {/* ── Past Reports ─────────────────────────────────────────── */}
          <section className="setup-card" style={{ marginTop: "16px" }}>
            <h3>Past Reports</h3>
            <p className="section-caption">
              {userRole === "Admin" || userRole === "Budget Analyst"
                ? "All generated reports across the organisation."
                : "Your previously generated reports."}
            </p>

            {listLoading && <p className="section-caption" style={{ marginTop: "10px" }}>Loading…</p>}

            {!listLoading && reports.length === 0 && (
              <p className="section-caption" style={{ marginTop: "10px" }}>No reports generated yet.</p>
            )}

            <div className="mr-report-list">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className={`mr-report-item ${preview?.id === r.id ? "mr-report-item-active" : ""}`}
                >
                  <div className="mr-report-item-top">
                    <span className="mr-report-item-title">{r.title}</span>
                    <span
                      className="mr-status-badge"
                      style={{ color: STATUS_COLOR[r.status] || "#64748b" }}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="mr-report-item-meta">
                    <span>{r.reportType}</span>
                    {r.wordCount ? <span>{wordCountLabel(r.wordCount)}</span> : null}
                    {r.sourcesUsed ? <span>{r.sourcesUsed} sources</span> : null}
                    <span>{formatDate(r.createdAt)}</span>
                    {r.generatedBy && r.generatedBy !== "You" && (
                      <span>by {r.generatedBy}</span>
                    )}
                  </div>
                  <div className="mr-report-item-actions">
                    {r.status === "Ready" && (
                      <button
                        type="button"
                        className="action-btn"
                        style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                        disabled={downloadingId === r.id}
                        onClick={() => handleDownload(r.id, r.title, r.format)}
                      >
                        {downloadingId === r.id ? "…" : `Download .${r.format || "txt"}`}
                      </button>
                    )}
                    {userRole !== "Read Only" && (
                      <button
                        type="button"
                        className="action-btn"
                        style={{ padding: "4px 10px", fontSize: "0.75rem", opacity: 0.65 }}
                        disabled={deletingId === r.id}
                        onClick={() => handleDelete(r.id)}
                      >
                        {deletingId === r.id ? "…" : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── RIGHT: Preview pane ───────────────────────────────────── */}
        <div className="mr-right">
          {!preview && !generating && (
            <div className="mr-preview-empty">
              <div className="mr-preview-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <p>Configure your report on the left and click <strong>Generate Report</strong>.</p>
              <p className="section-caption">
                The AI will read through your approved documents and write a structured report
                tailored to your selected purpose.
              </p>
            </div>
          )}

          {generating && (
            <div className="mr-preview-empty">
              <div className="mr-generating-anim">
                <span /><span /><span />
              </div>
              <p style={{ marginTop: "16px", fontWeight: 600 }}>Generating your report…</p>
              <p className="section-caption">
                The AI is reading your approved documents and writing the report.
                This usually takes 10–30 seconds.
              </p>
            </div>
          )}

          {preview && !generating && (
            <div className="mr-preview-card">
              <div className="mr-preview-header">
                <div>
                  <h3 className="mr-preview-title">{preview.title}</h3>
                  <div className="mr-preview-meta">
                    <span>{preview.reportType}</span>
                    {preview.wordCount && <span>{wordCountLabel(preview.wordCount)}</span>}
                    {preview.sourcesUsed != null && (
                      <span>{preview.sourcesUsed} source{preview.sourcesUsed !== 1 ? "s" : ""} used</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => handleDownload(preview.id, preview.title, preview.format)}
                  disabled={downloadingId === preview.id}
                >
                  {downloadingId === preview.id
                    ? "Downloading…"
                    : `Download .${preview.format || "txt"}`}
                </button>
              </div>

              <pre className="mr-preview-content">{preview.content}</pre>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function getTypeHint(type) {
  const hints = {
    "Board Summary": "High-level executive narrative of budget policies and strategic priorities for board presentation.",
    "Tax Filing Summary": "Financial policy excerpts organised for tax treatment, fund classification, and filing compliance.",
    "Department Budget Report": "All approved policies, procedures, and training materials for a specific department.",
    "Policy Compliance Report": "Assessment of policy coverage, gaps, and compliance risk across the knowledge base.",
    "Fiscal Year Review": "Review of budget policies, changes, and key decisions for a specific fiscal year.",
    "Audit Trail Report": "Formal audit-ready report of approved documents, approvers, and policy adherence findings.",
    "Custom Report": "Write your own guidance in the Additional Notes field — the AI follows your instructions."
  };
  return hints[type] || "";
}
