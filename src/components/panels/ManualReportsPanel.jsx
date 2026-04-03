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

// Contextual guidance chips per report type — users click to append to notes
const NOTE_CHIPS = {
  "Board Summary": [
    "Write for a non-technical board audience",
    "Highlight strategic priorities",
    "Include risk and compliance flags",
    "Keep under 2 pages"
  ],
  "Tax Filing Summary": [
    "Emphasise restricted vs unrestricted funds",
    "Include filing deadline references",
    "List deductible expenditure categories",
    "Flag any compliance gaps"
  ],
  "Department Budget Report": [
    "Include approval chain details",
    "List training requirements",
    "Focus on unspent allocations",
    "Compare against prior year"
  ],
  "Policy Compliance Report": [
    "Highlight policy gaps",
    "Prioritise high-risk items",
    "Include remediation suggestions",
    "List policies expiring this year"
  ],
  "Fiscal Year Review": [
    "Include carryforward provisions",
    "Summarise key policy changes",
    "Highlight budget vs actual variances",
    "Cover year-end closure procedures"
  ],
  "Audit Trail Report": [
    "List all approvers and dates",
    "Flag documents missing sign-off",
    "Include anomalies and observations",
    "Structure for external auditor review"
  ],
  "Custom Report": [
    "Focus on capital expenditures",
    "Write executive summary first",
    "Include data tables where possible",
    "Cite all source documents explicitly"
  ]
};

const TYPE_HINTS = {
  "Board Summary": "High-level executive narrative of budget policies and strategic priorities for board presentation.",
  "Tax Filing Summary": "Financial policy excerpts organised for tax treatment, fund classification, and filing compliance.",
  "Department Budget Report": "All approved policies, procedures, and training materials for a specific department.",
  "Policy Compliance Report": "Assessment of policy coverage, gaps, and compliance risk across the knowledge base.",
  "Fiscal Year Review": "Review of budget policies, changes, and key decisions for a specific fiscal year.",
  "Audit Trail Report": "Formal audit-ready report of approved documents, approvers, and policy adherence findings.",
  "Custom Report": "Write your own guidance in the Additional Notes field — the AI follows your instructions."
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

// Build a smart title suggestion from the current form selections
function buildSuggestedTitle(form) {
  const parts = [];
  if (form.fiscalYear) parts.push(form.fiscalYear);
  if (form.departmentName) parts.push(form.departmentName);
  parts.push(form.reportType);
  return parts.join(" — ");
}

// Build a human-readable scope summary for the right-panel preview
function buildScopeSummary(form, departments) {
  const lines = [];
  lines.push(`Report type: ${form.reportType}`);
  if (form.departmentName) lines.push(`Department: ${form.departmentName}`);
  if (form.domain) lines.push(`Domain: ${form.domain}`);
  if (form.fiscalYear) lines.push(`Fiscal year: ${form.fiscalYear}`);
  if (form.dateFrom || form.dateTo) {
    const from = form.dateFrom || "earliest";
    const to = form.dateTo || "latest";
    lines.push(`Document range: ${from} → ${to}`);
  }
  if (!form.departmentName && !form.domain && !form.fiscalYear) {
    lines.push("Scope: All departments · All domains · All years");
  }
  return lines;
}

export default function ManualReportsPanel({ authToken, userRole, userDepartmentId }) {
  const [form, setForm] = useState(defaultForm);
  const [departments, setDepartments] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [preview, setPreview] = useState(null);
  const [reports, setReports] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const SCOPED = userRole === "Department Editor" || userRole === "Read Only";

  useEffect(() => {
    if (!authToken) return;
    getDepartments(authToken)
      .then(({ departments: list }) => {
        setDepartments(list || []);
        if (SCOPED && userDepartmentId && list?.length) {
          const dept = list.find((d) => d.id === userDepartmentId);
          if (dept) {
            setForm((f) => ({ ...f, departmentId: String(dept.id), departmentName: dept.name }));
          }
        }
      })
      .catch(() => {});
  }, [authToken]);

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
    setForm((f) => ({ ...f, departmentId: id, departmentName: dept ? dept.name : "" }));
  };

  const handleSuggestTitle = () => {
    const suggested = buildSuggestedTitle(form);
    setField("title", suggested);
  };

  const appendChip = (text) => {
    setForm((f) => {
      const current = f.additionalNotes.trim();
      return {
        ...f,
        additionalNotes: current ? `${current}. ${text}` : text
      };
    });
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
      // Use previewContent (raw AI text) for display; binary content is served via /download
      setPreview({ ...report, displayContent: report.previewContent || report.content });
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

  const scopeLines = buildScopeSummary(form, departments);
  const chips = NOTE_CHIPS[form.reportType] || [];

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
            <h3>Configure Your Report</h3>
            <p className="mr-intro-hint">
              Fill in the fields below. The AI will read your approved documents and write a
              structured report. Use the suggestions to get better results.
            </p>

            <form onSubmit={handleGenerate}>

              {/* ── Report Type (first — drives everything else) ───────── */}
              <div className="mr-form-section">
                <label className="field">
                  <span className="mr-field-label">Report Type <span className="mr-required">*</span></span>
                  <select value={form.reportType} onChange={(e) => setField("reportType", e.target.value)}>
                    {REPORT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <p className="mr-type-hint">{TYPE_HINTS[form.reportType]}</p>
              </div>

              {/* ── Report Title ──────────────────────────────────────── */}
              <div className="mr-form-section">
                <label className="field">
                  <span className="mr-field-label">Report Title <span className="mr-required">*</span></span>
                  <div className="mr-title-row">
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setField("title", e.target.value)}
                      placeholder="e.g. FY26 Board Budget Summary"
                      maxLength={200}
                    />
                    <button
                      type="button"
                      className="mr-suggest-btn"
                      onClick={handleSuggestTitle}
                      title="Let AI suggest a title based on your selections"
                    >
                      Suggest
                    </button>
                  </div>
                </label>
                <p className="mr-field-hint">A clear title helps identify the report later. Click <strong>Suggest</strong> to auto-fill from your selections below.</p>
              </div>

              {/* ── Scope filters ─────────────────────────────────────── */}
              <div className="mr-form-section">
                <p className="mr-section-label">Scope Filters <span className="mr-optional">(optional — narrows what the AI reads)</span></p>
                <div className="config-grid two-col">

                  <label className="field">
                    <span>Department</span>
                    <select value={form.departmentId} onChange={handleDeptChange} disabled={SCOPED}>
                      <option value="">All Departments</option>
                      {departments.map((d) => (
                        <option key={d.id} value={String(d.id)}>{d.name}</option>
                      ))}
                    </select>
                    <span className="mr-field-hint">Limit sources to one department.</span>
                  </label>

                  <label className="field">
                    <span>Domain</span>
                    <select value={form.domain} onChange={(e) => setField("domain", e.target.value)}>
                      <option value="">All Domains</option>
                      {DOMAINS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <span className="mr-field-hint">Focus on a specific knowledge category.</span>
                  </label>

                  <label className="field">
                    <span>Fiscal Year</span>
                    <select value={form.fiscalYear} onChange={(e) => setField("fiscalYear", e.target.value)}>
                      <option value="">All Years</option>
                      {FISCAL_YEARS.map((fy) => (
                        <option key={fy} value={fy}>{fy}</option>
                      ))}
                    </select>
                    <span className="mr-field-hint">Filters documents mentioning this fiscal year.</span>
                  </label>

                  <label className="field">
                    <span>Download Format</span>
                    <select value={form.format} onChange={(e) => setField("format", e.target.value)}>
                      <option value="txt">Plain Text (.txt)</option>
                      <option value="docx">Word Document (.docx)</option>
                      <option value="pdf">PDF Document (.pdf)</option>
                    </select>
                    <span className="mr-field-hint">PDF and Word formats preserve headings and structure.</span>
                  </label>

                  <label className="field">
                    <span>Documents From</span>
                    <input type="date" value={form.dateFrom} onChange={(e) => setField("dateFrom", e.target.value)} />
                    <span className="mr-field-hint">Only include documents uploaded after this date.</span>
                  </label>

                  <label className="field">
                    <span>Documents To</span>
                    <input type="date" value={form.dateTo} onChange={(e) => setField("dateTo", e.target.value)} />
                    <span className="mr-field-hint">Only include documents uploaded before this date.</span>
                  </label>
                </div>
              </div>

              {/* ── AI Guidance ───────────────────────────────────────── */}
              <div className="mr-form-section">
                <label className="field" style={{ display: "grid", gap: "6px" }}>
                  <span className="mr-field-label">
                    Additional Guidance for AI
                    <span className="mr-optional"> (optional — tell the AI what to focus on)</span>
                  </span>
                  <textarea
                    className="mr-textarea"
                    value={form.additionalNotes}
                    onChange={(e) => setField("additionalNotes", e.target.value)}
                    placeholder="e.g. Focus on capital expenditures. Write for a non-technical board audience."
                    rows={3}
                    maxLength={1000}
                  />
                </label>

                {/* Quick-insert suggestion chips */}
                <div className="mr-chips-section">
                  <p className="mr-chips-label">Quick suggestions — click to add:</p>
                  <div className="mr-chips">
                    {chips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="mr-chip"
                        onClick={() => appendChip(chip)}
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {genError && <p className="mr-error">{genError}</p>}

              <div className="inline-actions" style={{ marginTop: "14px" }}>
                <button
                  type="submit"
                  className="action-btn"
                  disabled={generating}
                  style={{ minWidth: "160px" }}
                >
                  {generating ? (
                    <><span className="mr-spinner" /> Generating…</>
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
                    <span className="mr-status-badge" style={{ color: STATUS_COLOR[r.status] || "#64748b" }}>
                      {r.status}
                    </span>
                  </div>
                  <div className="mr-report-item-meta">
                    <span>{r.reportType}</span>
                    {r.wordCount ? <span>{wordCountLabel(r.wordCount)}</span> : null}
                    {r.sourcesUsed ? <span>{r.sourcesUsed} sources</span> : null}
                    <span>{formatDate(r.createdAt)}</span>
                    {r.generatedBy && r.generatedBy !== "You" && <span>by {r.generatedBy}</span>}
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

        {/* ── RIGHT: Preview / coverage pane ────────────────────────── */}
        <div className="mr-right">
          {!preview && !generating && (
            <div className="mr-preview-empty">
              <div className="mr-preview-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" width="44" height="44">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>

              <p style={{ fontWeight: 600, marginTop: "12px" }}>Your report will be shown here</p>
              <p className="section-caption" style={{ marginBottom: "16px" }}>
                Configure the form on the left and click <strong>Generate Report</strong>.
              </p>

              {/* Live scope card — updates as user fills the form */}
              <div className="mr-scope-card">
                <p className="mr-scope-card-title">Current scope</p>
                {scopeLines.map((line, i) => (
                  <p key={i} className="mr-scope-line">{line}</p>
                ))}
                {form.additionalNotes && (
                  <p className="mr-scope-notes">
                    <em>AI guidance:</em> {form.additionalNotes}
                  </p>
                )}
              </div>

              <div className="mr-tips-card">
                <p className="mr-tips-title">Tips for a better report</p>
                <ul className="mr-tips-list">
                  <li>Select a <strong>Fiscal Year</strong> to keep content focused</li>
                  <li>Pick a <strong>Domain</strong> to reduce noise from unrelated documents</li>
                  <li>Use the <strong>quick suggestion chips</strong> to guide the AI writing style</li>
                  <li>Choose <strong>Word (.docx)</strong> format for formatted headings</li>
                </ul>
              </div>
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
              <div className="mr-scope-card" style={{ marginTop: "20px" }}>
                {scopeLines.map((line, i) => (
                  <p key={i} className="mr-scope-line">{line}</p>
                ))}
              </div>
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
                  {downloadingId === preview.id ? "Downloading…" : `Download .${preview.format || "txt"}`}
                </button>
              </div>
              {preview.format === "txt" ? (
                <pre className="mr-preview-content">{preview.displayContent}</pre>
              ) : (
                <div className="mr-preview-binary">
                  <div className="mr-preview-binary-icon">
                    {preview.format === "pdf" ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <path d="M9 13h1a2 2 0 0 1 0 4H9v-4z" />
                        <line x1="15" y1="13" x2="15" y2="17" />
                        <line x1="13" y1="15" x2="17" y2="15" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    )}
                  </div>
                  <p className="mr-preview-binary-title">
                    {preview.format === "pdf" ? "PDF" : "Word Document"} ready
                  </p>
                  <p className="mr-preview-binary-sub">
                    Click <strong>Download .{preview.format}</strong> above to save the file.
                  </p>
                  {preview.displayContent && (
                    <details className="mr-preview-text-toggle">
                      <summary>Preview report text</summary>
                      <pre className="mr-preview-content" style={{ marginTop: "12px", maxHeight: "360px" }}>
                        {preview.displayContent}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
