import { useEffect, useState, useCallback } from "react";
import { useMasterData } from "../../hooks/useMasterData.js";
import { getDepartments } from "../../services/adminApi.js";
import {
  listBudgetRequests,
  getBudgetRequest,
  createBudgetRequest,
  updateBudgetRequest,
  submitBudgetRequest,
  reviewBudgetRequest,
  analyzeRequest,
  deleteBudgetRequest,
  generateRequestsSummary,
  getAnomalyDashboard,
  resolveAnomalyFlag,
  exportBudgetRequestsXlsx,
  getScoringCriteria,
  updateScoringCriteria
} from "../../services/budgetRequestsApi.js";

// ── Static fallbacks (used while master-data loads) ───────────────────────────
const FB_FISCAL_YEARS  = ["FY27", "FY26", "FY25", "FY24", "FY23"];
const FB_REQUEST_TYPES = ["operational", "capital", "staffing", "grant", "other"];
const FB_COST_TYPES    = ["one-time", "recurring", "mixed"];
const FB_EXPENSE_CATS  = ["Personnel", "Operations", "Technology", "Facilities"];
const FB_FUND_TYPES    = ["General Fund", "Restricted Fund", "Capital Fund"];
const FB_PRIORITIES    = ["low", "normal", "high", "critical"];
const AUDIENCE_LEVELS = [
  { value: "analyst",  label: "Analyst Briefing" },
  { value: "dean",     label: "Dean-Level Summary" },
  { value: "cabinet",  label: "Cabinet Executive Summary" },
  { value: "board",    label: "Board Narrative" }
];

const STATUS_CONFIG = {
  draft:        { label: "Draft",        color: "#6b7280" },
  submitted:    { label: "Submitted",    color: "#2563eb" },
  under_review: { label: "Under Review", color: "#d97706" },
  approved:     { label: "Approved",     color: "#16a34a" },
  denied:       { label: "Denied",       color: "#dc2626" },
  on_hold:      { label: "On Hold",      color: "#7c3aed" }
};

const RISK_CONFIG = {
  none:     { label: "None",     color: "#6b7280" },
  low:      { label: "Low",      color: "#16a34a" },
  medium:   { label: "Medium",   color: "#d97706" },
  high:     { label: "High",     color: "#dc2626" },
  critical: { label: "Critical", color: "#7c2d12" }
};

const EMPTY_FORM = {
  title: "", fiscalYear: "FY27", fundType: "", expenseCategory: "",
  requestType: "operational", costType: "recurring",
  baseBudgetAmount: "", requestedAmount: "", recurringAmount: "", oneTimeAmount: "",
  justification: "", strategicAlignment: "", impactDescription: "", deadline: ""
};

const fmt = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n) => `${(Number(n) * 100).toFixed(0)}%`;

// ── Main Component ────────────────────────────────────────────────────────────
export default function BudgetRequestsPanel({ authToken, user }) {
  // ── Master data from DB ──────────────────────────────────────────────────────
  const { values: FISCAL_YEARS  } = useMasterData(authToken, "Fiscal Year",    FB_FISCAL_YEARS);
  const { values: REQUEST_TYPES } = useMasterData(authToken, "Request Type",   FB_REQUEST_TYPES);
  const { values: COST_TYPES    } = useMasterData(authToken, "Cost Type",      FB_COST_TYPES);
  const { values: EXPENSE_CATS  } = useMasterData(authToken, "Expense Category", FB_EXPENSE_CATS);
  const { values: FUND_TYPES    } = useMasterData(authToken, "Fund Type",      FB_FUND_TYPES);
  const { values: PRIORITIES    } = useMasterData(authToken, "Priority",       FB_PRIORITIES);

  const [view, setView]               = useState("list");   // list | detail | form | anomalies | summary | scoring
  const [requests, setRequests]       = useState([]);
  const [total, setTotal]             = useState(0);
  const [selected, setSelected]       = useState(null);     // full request object with scores/validations
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [exporting, setExporting]     = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");
  const [anomalies, setAnomalies]     = useState({ flags: [], counts: [] });
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Filters
  const [filterStatus,   setFilterStatus]   = useState("all");
  const [filterFY,       setFilterFY]       = useState("");
  const [filterDept,     setFilterDept]     = useState("");
  const [audienceLevel,  setAudienceLevel]  = useState("analyst");

  // Form state
  const [form, setForm]             = useState(EMPTY_FORM);
  const [editingId, setEditingId]   = useState(null);

  // Review panel state
  const [reviewForm, setReviewForm] = useState({ status: "", reviewerNotes: "", decisionRationale: "", priority: "" });
  const [showReview, setShowReview] = useState(false);

  const isReviewer  = ["Admin", "Budget Analyst"].includes(user?.role);
  const isSubmitter = ["Admin", "Budget Analyst", "Department Editor"].includes(user?.role);

  const showMsg = (type, msg) => {
    if (type === "error") setError(msg);
    else setSuccess(msg);
    setTimeout(() => { setError(""); setSuccess(""); }, 4000);
  };

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadRequests = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const res = await listBudgetRequests(authToken, {
        status: filterStatus, fiscalYear: filterFY, departmentId: filterDept
      });
      setRequests(res.requests || []);
      setTotal(res.total || 0);
    } catch (e) {
      showMsg("error", e.message);
    } finally {
      setLoading(false);
    }
  }, [authToken, filterStatus, filterFY, filterDept]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (authToken && isReviewer) {
      getDepartments(authToken).then((r) => setDepartments(r.departments || [])).catch(() => {});
    }
  }, [authToken, isReviewer]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function openDetail(id) {
    setLoading(true);
    setError("");
    try {
      const res = await getBudgetRequest(authToken, id);
      setSelected(res.request);
      setShowReview(false);
      setView("detail");
    } catch (e) {
      showMsg("error", e.message);
    } finally {
      setLoading(false);
    }
  }

  function openForm(req = null) {
    if (req) {
      setForm({
        title: req.title, fiscalYear: req.fiscalYear, fundType: req.fundType || "",
        expenseCategory: req.expenseCategory || "", requestType: req.requestType,
        costType: req.costType, baseBudgetAmount: req.baseBudgetAmount || "",
        requestedAmount: req.requestedAmount || "", recurringAmount: req.recurringAmount || "",
        oneTimeAmount: req.oneTimeAmount || "", justification: req.justification,
        strategicAlignment: req.strategicAlignment || "", impactDescription: req.impactDescription || "",
        deadline: req.deadline ? req.deadline.slice(0, 10) : ""
      });
      setEditingId(req.id);
    } else {
      setForm(EMPTY_FORM);
      setEditingId(null);
    }
    setView("form");
  }

  async function handleSave() {
    if (!form.title || !form.requestedAmount || !form.justification) {
      showMsg("error", "Title, requested amount, and justification are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        requestedAmount:  Number(form.requestedAmount)  || 0,
        baseBudgetAmount: Number(form.baseBudgetAmount) || 0,
        recurringAmount:  Number(form.recurringAmount)  || 0,
        oneTimeAmount:    Number(form.oneTimeAmount)    || 0,
        deadline:         form.deadline || undefined,
        fundType:         form.fundType || undefined,
        expenseCategory:  form.expenseCategory || undefined,
        strategicAlignment: form.strategicAlignment || undefined,
        impactDescription:  form.impactDescription || undefined
      };
      if (editingId) {
        await updateBudgetRequest(authToken, editingId, payload);
        showMsg("success", "Request updated.");
      } else {
        await createBudgetRequest(authToken, payload);
        showMsg("success", "Request created as draft.");
      }
      await loadRequests();
      setView("list");
    } catch (e) {
      showMsg("error", e.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(id) {
    setSaving(true);
    try {
      await submitBudgetRequest(authToken, id);
      showMsg("success", "Request submitted. AI analysis is running…");
      await loadRequests();
      if (selected?.id === id) await openDetail(id);
    } catch (e) {
      showMsg("error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAnalyze(id) {
    setSaving(true);
    try {
      await analyzeRequest(authToken, id);
      showMsg("success", "Analysis complete.");
      await openDetail(id);
    } catch (e) {
      showMsg("error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReview() {
    if (!reviewForm.status) { showMsg("error", "Select a review decision."); return; }
    setSaving(true);
    try {
      await reviewBudgetRequest(authToken, selected.id, {
        status: reviewForm.status,
        reviewerNotes: reviewForm.reviewerNotes || undefined,
        decisionRationale: reviewForm.decisionRationale || undefined,
        priority: reviewForm.priority || undefined
      });
      showMsg("success", `Request ${reviewForm.status}.`);
      setShowReview(false);
      await openDetail(selected.id);
      await loadRequests();
    } catch (e) {
      showMsg("error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this request? This cannot be undone.")) return;
    setSaving(true);
    try {
      await deleteBudgetRequest(authToken, id);
      showMsg("success", "Request deleted.");
      await loadRequests();
      if (selected?.id === id) setView("list");
    } catch (e) {
      showMsg("error", e.message);
    } finally {
      setSaving(false);
    }
  }

  const [anomalyLoading, setAnomalyLoading] = useState(false);

  async function loadAnomalies() {
    setAnomalyLoading(true);
    try {
      const res = await getAnomalyDashboard(authToken, { fiscalYear: filterFY });
      setAnomalies(res || { flags: [], counts: [] });
    } catch (e) {
      showMsg("error", e.message);
    } finally {
      setAnomalyLoading(false);
    }
  }

  async function handleResolveFlag(flagId) {
    try {
      await resolveAnomalyFlag(authToken, flagId);
      setAnomalies((prev) => ({
        ...prev,
        flags: prev.flags.filter((f) => f.id !== flagId)
      }));
      showMsg("success", "Flag resolved.");
    } catch (e) {
      showMsg("error", e.message);
    }
  }

  async function handleExport() {
    if (!filterFY) {
      showMsg("error", "Please select a Fiscal Year before exporting.");
      return;
    }
    const filterDesc = [
      filterFY,
      filterStatus !== "all" ? STATUS_CONFIG[filterStatus]?.label : null,
      filterDept ? departments.find((d) => String(d.id) === String(filterDept))?.name : null
    ].filter(Boolean).join(", ");
    if (!window.confirm(`Export to Excel?\nFilters: ${filterDesc}\n\nThis will download all matching requests.`)) return;

    setExporting(true);
    try {
      await exportBudgetRequestsXlsx(authToken, {
        fiscalYear:   filterFY,
        status:       filterStatus !== "all" ? filterStatus : undefined,
        departmentId: filterDept || undefined
      });
      showMsg("success", `Excel exported for ${filterDesc}.`);
    } catch (e) {
      showMsg("error", e.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function handleGenerateSummary() {
    setSummaryLoading(true);
    try {
      const res = await generateRequestsSummary(authToken, { fiscalYear: filterFY, audienceLevel });
      setSummaryData(res);
    } catch (e) {
      showMsg("error", e.message);
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    if (view === "anomalies") loadAnomalies();
  }, [view, filterFY]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <article className="panel active">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="panel-header-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>Budget Requests</h2>
          <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            Submit, analyze, score, and review department budget requests
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {view !== "list" && (
            <button className="btn-secondary" onClick={() => setView("list")}>← Back to List</button>
          )}
          {view === "list" && isReviewer && (
            <>
              <button className="btn-secondary" onClick={() => { setView("anomalies"); }}>⚠ Anomalies</button>
              <button className="btn-secondary" onClick={() => { setView("summary"); setSummaryData(null); }}>📋 Summary</button>
              <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
                {exporting ? "Exporting…" : "⬇ Export Excel"}
              </button>
            </>
          )}
          {view === "list" && user?.role === "Admin" && (
            <button className="btn-secondary" onClick={() => setView("scoring")}>⚙ Scoring Config</button>
          )}
          {view === "list" && isSubmitter && (
            <button className="btn-primary" onClick={() => openForm()}>+ New Request</button>
          )}
        </div>
      </div>

      {/* ── Alerts ──────────────────────────────────────────────────────────── */}
      {error   && <div className="alert alert-error"   style={alertStyle("#fef2f2", "#dc2626")}>{error}</div>}
      {success && <div className="alert alert-success" style={alertStyle("#f0fdf4", "#16a34a")}>{success}</div>}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* LIST VIEW                                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {view === "list" && (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select value={filterFY} onChange={(e) => setFilterFY(e.target.value)} style={selectStyle}>
              <option value="">All Fiscal Years</option>
              {FISCAL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {isReviewer && (
              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={selectStyle}>
                <option value="">All Departments</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            <button className="btn-secondary" onClick={loadRequests} style={{ marginLeft: "auto" }}>
              ↺ Refresh
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>Loading requests…</div>
          ) : requests.length === 0 ? (
            <EmptyState isSubmitter={isSubmitter} onNew={() => openForm()} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    {["Title", "Department", "FY", "Type", "Amount", "Status", "Risk", "Score", ""].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <RequestRow key={r.id} r={r} onOpen={openDetail} onDelete={handleDelete} isReviewer={isReviewer} user={user} />
                  ))}
                </tbody>
              </table>
              <p style={{ color: "#6b7280", fontSize: "0.8rem", marginTop: "0.5rem" }}>
                Showing {requests.length} of {total} requests
              </p>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* FORM VIEW                                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {view === "form" && (
        <RequestForm
          form={form}
          setForm={setForm}
          editingId={editingId}
          onSave={handleSave}
          saving={saving}
          onCancel={() => setView("list")}
          fiscalYears={FISCAL_YEARS}
          requestTypes={REQUEST_TYPES}
          costTypes={COST_TYPES}
          expenseCats={EXPENSE_CATS}
          fundTypes={FUND_TYPES}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* DETAIL VIEW                                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {view === "detail" && selected && (
        <RequestDetail
          req={selected}
          isReviewer={isReviewer}
          user={user}
          saving={saving}
          showReview={showReview}
          reviewForm={reviewForm}
          setReviewForm={setReviewForm}
          priorities={PRIORITIES}
          onEdit={() => openForm(selected)}
          onSubmit={() => handleSubmit(selected.id)}
          onAnalyze={() => handleAnalyze(selected.id)}
          onDelete={() => handleDelete(selected.id)}
          onReviewOpen={() => setShowReview(true)}
          onReviewClose={() => setShowReview(false)}
          onReviewSubmit={handleReview}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ANOMALIES VIEW                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {view === "anomalies" && (
        <AnomalyDashboard
          anomalies={anomalies}
          loading={anomalyLoading}
          filterFY={filterFY}
          setFilterFY={setFilterFY}
          fiscalYears={FISCAL_YEARS}
          onResolve={handleResolveFlag}
          onRefresh={loadAnomalies}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SUMMARY VIEW                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {view === "summary" && (
        <SummaryView
          summaryData={summaryData}
          summaryLoading={summaryLoading}
          filterFY={filterFY}
          setFilterFY={setFilterFY}
          fiscalYears={FISCAL_YEARS}
          audienceLevel={audienceLevel}
          setAudienceLevel={setAudienceLevel}
          onGenerate={handleGenerateSummary}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SCORING CONFIG VIEW (Admin only)                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {view === "scoring" && (
        <ScoringCriteriaEditor
          authToken={authToken}
          onBack={() => setView("list")}
        />
      )}
    </article>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RequestRow({ r, onOpen, onDelete, isReviewer, user }) {
  const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.draft;
  const riskCfg   = RISK_CONFIG[r.riskFlag] || RISK_CONFIG.none;

  // Compute total weighted score
  const totalScore = r.scores
    ? r.scores.reduce((s, sc) => s + Number(sc.weighted_score || 0), 0)
    : null;

  const canDelete = user?.role === "Admin" || (r.submittedBy === user?.id && ["draft", "denied"].includes(r.status));

  return (
    <tr style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }} onClick={() => onOpen(r.id)}>
      <td style={tdStyle}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: "0.875rem" }}>{r.title}</p>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.75rem" }}>{r.costType} · {r.requestType}</p>
      </td>
      <td style={tdStyle}><span style={{ fontSize: "0.8rem" }}>{r.departmentName}</span></td>
      <td style={tdStyle}><span style={{ fontSize: "0.8rem" }}>{r.fiscalYear}</span></td>
      <td style={tdStyle}><span style={{ fontSize: "0.8rem", textTransform: "capitalize" }}>{r.requestType}</span></td>
      <td style={tdStyle}><strong style={{ fontSize: "0.875rem" }}>{fmt(r.requestedAmount)}</strong></td>
      <td style={tdStyle}>
        <span style={{ ...badgeStyle, background: statusCfg.color + "20", color: statusCfg.color }}>{statusCfg.label}</span>
      </td>
      <td style={tdStyle}>
        {r.riskFlag && r.riskFlag !== "none" && (
          <span style={{ ...badgeStyle, background: riskCfg.color + "20", color: riskCfg.color }}>{riskCfg.label}</span>
        )}
      </td>
      <td style={tdStyle}>
        {totalScore !== null ? (
          <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{(totalScore * 10).toFixed(1)}/10</span>
        ) : r.analyzedAt ? (
          <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>Scored</span>
        ) : r.status === "submitted" ? (
          <span style={{ fontSize: "0.75rem", color: "#d97706" }}>Analyzing…</span>
        ) : <span style={{ color: "#d1d5db" }}>—</span>}
      </td>
      <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
        {canDelete && (
          <button
            style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "0.8rem", padding: "0.25rem" }}
            onClick={() => onDelete(r.id)}
          >✕</button>
        )}
      </td>
    </tr>
  );
}

function RequestForm({ form, setForm, editingId, onSave, saving, onCancel,
  fiscalYears = FB_FISCAL_YEARS, requestTypes = FB_REQUEST_TYPES,
  costTypes = FB_COST_TYPES, expenseCats = FB_EXPENSE_CATS, fundTypes = FB_FUND_TYPES }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ maxWidth: "860px" }}>
      <h3 style={{ margin: "0 0 1.25rem", fontWeight: 700 }}>{editingId ? "Edit Request" : "New Budget Request"}</h3>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Basic Information</legend>
        <div style={formRowStyle}>
          <FormField label="Request Title *" flex={2}>
            <input style={inputStyle} value={form.title} onChange={set("title")} placeholder="Brief descriptive title" />
          </FormField>
          <FormField label="Fiscal Year *">
            <select style={inputStyle} value={form.fiscalYear} onChange={set("fiscalYear")}>
              {fiscalYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </FormField>
        </div>
        <div style={formRowStyle}>
          <FormField label="Request Type">
            <select style={inputStyle} value={form.requestType} onChange={set("requestType")}>
              {requestTypes.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </FormField>
          <FormField label="Cost Type">
            <select style={inputStyle} value={form.costType} onChange={set("costType")}>
              {costTypes.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </FormField>
          <FormField label="Expense Category">
            <select style={inputStyle} value={form.expenseCategory} onChange={set("expenseCategory")}>
              <option value="">— Select —</option>
              {expenseCats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Fund Type">
            <select style={inputStyle} value={form.fundType} onChange={set("fundType")}>
              <option value="">— Select —</option>
              {fundTypes.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </FormField>
        </div>
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Amounts (USD)</legend>
        <div style={formRowStyle}>
          <FormField label="Base Budget Amount">
            <input style={inputStyle} type="number" min="0" value={form.baseBudgetAmount} onChange={set("baseBudgetAmount")} placeholder="0" />
          </FormField>
          <FormField label="Requested Amount *">
            <input style={inputStyle} type="number" min="1" value={form.requestedAmount} onChange={set("requestedAmount")} placeholder="Required" />
          </FormField>
          <FormField label="Recurring Amount">
            <input style={inputStyle} type="number" min="0" value={form.recurringAmount} onChange={set("recurringAmount")} placeholder="0" />
          </FormField>
          <FormField label="One-Time Amount">
            <input style={inputStyle} type="number" min="0" value={form.oneTimeAmount} onChange={set("oneTimeAmount")} placeholder="0" />
          </FormField>
        </div>
        <FormField label="Submission Deadline">
          <input style={{ ...inputStyle, maxWidth: "200px" }} type="date" value={form.deadline} onChange={set("deadline")} />
        </FormField>
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Justification & Impact</legend>
        <FormField label="Justification * (minimum 20 characters)">
          <textarea style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }} value={form.justification} onChange={set("justification")}
            placeholder="Explain the need, purpose, and expected outcomes. Be specific." />
        </FormField>
        <FormField label="Strategic Alignment">
          <textarea style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }} value={form.strategicAlignment} onChange={set("strategicAlignment")}
            placeholder="How does this request align with the institution's strategic plan?" />
        </FormField>
        <FormField label="Impact Description">
          <textarea style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }} value={form.impactDescription} onChange={set("impactDescription")}
            placeholder="Who benefits? How will students, faculty, or operations be affected?" />
        </FormField>
      </fieldset>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
        <button className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : editingId ? "Save Changes" : "Save Draft"}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

function RequestDetail({ req, isReviewer, user, saving, showReview, reviewForm, setReviewForm,
  priorities = FB_PRIORITIES,
  onEdit, onSubmit, onAnalyze, onDelete, onReviewOpen, onReviewClose, onReviewSubmit }) {

  const statusCfg  = STATUS_CONFIG[req.status] || STATUS_CONFIG.draft;
  const riskCfg    = RISK_CONFIG[req.riskFlag || "none"];
  const totalScore = req.scores?.reduce((s, sc) => s + Number(sc.weighted_score || 0), 0) ?? 0;
  const canEdit    = (req.submittedBy === user?.id || isReviewer) && ["draft", "on_hold"].includes(req.status);
  const canSubmit  = (req.submittedBy === user?.id || isReviewer) && ["draft", "on_hold"].includes(req.status);

  return (
    <div style={{ maxWidth: "960px" }}>
      {/* Title & badges */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 0.35rem", fontWeight: 700, fontSize: "1.2rem" }}>{req.title}</h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ ...badgeStyle, background: statusCfg.color + "20", color: statusCfg.color }}>{statusCfg.label}</span>
            <span style={{ ...badgeStyle, background: "#f3f4f6", color: "#374151" }}>{req.fiscalYear}</span>
            <span style={{ ...badgeStyle, background: "#f3f4f6", color: "#374151" }}>{req.departmentName}</span>
            {req.riskFlag && req.riskFlag !== "none" && (
              <span style={{ ...badgeStyle, background: riskCfg.color + "20", color: riskCfg.color }}>
                ⚠ Risk: {riskCfg.label}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {canEdit    && <button className="btn-secondary" onClick={onEdit}   disabled={saving}>Edit</button>}
          {canSubmit  && <button className="btn-primary"   onClick={onSubmit} disabled={saving}>Submit Request</button>}
          {isReviewer && req.status === "submitted" && (
            <button className="btn-secondary" onClick={onAnalyze} disabled={saving}>Re-Analyze</button>
          )}
          {isReviewer && ["submitted", "under_review"].includes(req.status) && !showReview && (
            <button className="btn-primary" onClick={onReviewOpen}>Review Decision</button>
          )}
        </div>
      </div>

      {/* Key metrics strip */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {[
          { label: "Requested",    value: fmt(req.requestedAmount) },
          { label: "Base Budget",  value: fmt(req.baseBudgetAmount) },
          { label: "Recurring",    value: fmt(req.recurringAmount) },
          { label: "One-Time",     value: fmt(req.oneTimeAmount) },
          { label: "AI Score",     value: req.analyzedAt ? `${(totalScore * 10).toFixed(1)}/10` : "—" },
          { label: "Confidence",   value: req.aiConfidence ? pct(req.aiConfidence) : "—" }
        ].map(({ label, value }) => (
          <div key={label} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.75rem 1rem", minWidth: "120px" }}>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
            <strong style={{ fontSize: "1rem" }}>{value}</strong>
          </div>
        ))}
      </div>

      {/* Review panel */}
      {showReview && isReviewer && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "1.25rem", marginBottom: "1.5rem", background: "#fafafa" }}>
          <h4 style={{ margin: "0 0 1rem", fontWeight: 700 }}>Review Decision</h4>
          <div style={formRowStyle}>
            <FormField label="Decision *">
              <select style={inputStyle} value={reviewForm.status} onChange={(e) => setReviewForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="">— Select —</option>
                <option value="approved">Approve</option>
                <option value="denied">Deny</option>
                <option value="on_hold">Put on Hold</option>
                <option value="under_review">Mark Under Review</option>
              </select>
            </FormField>
            <FormField label="Priority">
              <select style={inputStyle} value={reviewForm.priority} onChange={(e) => setReviewForm((f) => ({ ...f, priority: e.target.value }))}>
                <option value="">— Unchanged —</option>
                {priorities.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Reviewer Notes">
            <textarea style={{ ...inputStyle, minHeight: "70px" }} value={reviewForm.reviewerNotes}
              onChange={(e) => setReviewForm((f) => ({ ...f, reviewerNotes: e.target.value }))}
              placeholder="Optional notes visible to submitter" />
          </FormField>
          <FormField label="Decision Rationale">
            <textarea style={{ ...inputStyle, minHeight: "70px" }} value={reviewForm.decisionRationale}
              onChange={(e) => setReviewForm((f) => ({ ...f, decisionRationale: e.target.value }))}
              placeholder="Internal rationale for audit record" />
          </FormField>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
            <button className="btn-primary" onClick={onReviewSubmit} disabled={saving}>
              {saving ? "Saving…" : "Submit Decision"}
            </button>
            <button className="btn-secondary" onClick={onReviewClose}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        {/* Justification */}
        <DetailCard title="Justification">
          <p style={{ margin: 0, lineHeight: 1.6, fontSize: "0.875rem" }}>{req.justification}</p>
          {req.strategicAlignment && (
            <>
              <p style={{ margin: "0.75rem 0 0.25rem", fontWeight: 600, fontSize: "0.8rem", color: "#374151" }}>Strategic Alignment</p>
              <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5 }}>{req.strategicAlignment}</p>
            </>
          )}
          {req.impactDescription && (
            <>
              <p style={{ margin: "0.75rem 0 0.25rem", fontWeight: 600, fontSize: "0.8rem", color: "#374151" }}>Impact</p>
              <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5 }}>{req.impactDescription}</p>
            </>
          )}
        </DetailCard>

        {/* AI Analysis */}
        <DetailCard title="AI Analysis" badge={req.analyzedAt ? `Analyzed ${new Date(req.analyzedAt).toLocaleDateString()}` : "Not yet analyzed"}>
          {req.aiSummary ? (
            <>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", lineHeight: 1.6 }}>{req.aiSummary}</p>
              {req.aiMissingFields?.length > 0 && (
                <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "6px", padding: "0.6rem 0.8rem" }}>
                  <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 600, color: "#92400e" }}>Missing / Weak Fields:</p>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#78350f" }}>{req.aiMissingFields.join(", ")}</p>
                </div>
              )}
            </>
          ) : (
            <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
              {req.status === "submitted" ? "Analysis in progress…" : "Submit this request to trigger AI analysis."}
            </p>
          )}
        </DetailCard>

        {/* Scoring */}
        {req.scores?.length > 0 && (
          <DetailCard title={`Scoring — ${(totalScore * 10).toFixed(1)}/10`}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {req.scores.map((s) => (
                <div key={s.criteria_key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.2rem" }}>
                    <span style={{ color: "#374151" }}>{s.label}</span>
                    <span style={{ fontWeight: 600 }}>{s.raw_score}/10</span>
                  </div>
                  <div style={{ background: "#e5e7eb", borderRadius: "4px", height: "6px" }}>
                    <div style={{ background: scoreColor(s.raw_score), height: "6px", borderRadius: "4px", width: `${s.raw_score * 10}%`, transition: "width 0.3s" }} />
                  </div>
                  {s.rationale && <p style={{ margin: "0.2rem 0 0", fontSize: "0.7rem", color: "#6b7280" }}>{s.rationale}</p>}
                </div>
              ))}
            </div>
          </DetailCard>
        )}

        {/* Validations */}
        {req.validations?.length > 0 && (
          <DetailCard title="Validation Rules">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {req.validations.map((v) => (
                <div key={v.rule_key} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "0.8rem" }}>
                  <span style={{ marginTop: "1px" }}>{v.passed ? "✅" : v.severity === "error" ? "❌" : v.severity === "warning" ? "⚠️" : "ℹ️"}</span>
                  <div>
                    <span style={{ fontWeight: 600 }}>{v.rule_label}</span>
                    {!v.passed && <p style={{ margin: "0.1rem 0 0", color: "#6b7280" }}>{v.message}</p>}
                  </div>
                </div>
              ))}
            </div>
          </DetailCard>
        )}

        {/* Anomalies */}
        {req.anomalies?.length > 0 && (
          <DetailCard title="Anomaly Flags">
            {req.anomalies.map((a, i) => (
              <div key={i} style={{ padding: "0.5rem 0.75rem", border: "1px solid #fcd34d", borderRadius: "6px", marginBottom: "0.4rem", background: "#fffbeb" }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.8rem", color: "#92400e" }}>{a.flag_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#78350f" }}>{a.description}</p>
              </div>
            ))}
          </DetailCard>
        )}

        {/* Reviewer info */}
        {(req.reviewerNotes || req.decisionRationale) && (
          <DetailCard title="Review Notes">
            {req.reviewerNotes && (
              <>
                <p style={{ margin: "0 0 0.25rem", fontWeight: 600, fontSize: "0.8rem" }}>Notes for Submitter</p>
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>{req.reviewerNotes}</p>
              </>
            )}
            {req.decisionRationale && (
              <>
                <p style={{ margin: "0 0 0.25rem", fontWeight: 600, fontSize: "0.8rem" }}>Decision Rationale</p>
                <p style={{ margin: 0, fontSize: "0.875rem" }}>{req.decisionRationale}</p>
              </>
            )}
            {req.reviewedByName && (
              <p style={{ margin: "0.75rem 0 0", fontSize: "0.75rem", color: "#6b7280" }}>
                Reviewed by {req.reviewedByName} on {new Date(req.reviewedAt).toLocaleDateString()}
              </p>
            )}
          </DetailCard>
        )}
      </div>
    </div>
  );
}

function AnomalyDashboard({ anomalies, loading, filterFY, setFilterFY, fiscalYears = FB_FISCAL_YEARS, onResolve, onRefresh }) {
  const severityColor = { info: "#2563eb", warning: "#d97706", critical: "#dc2626" };

  return (
    <div>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontWeight: 700 }}>Anomaly & Trend Flags</h3>
        <select value={filterFY} onChange={(e) => setFilterFY(e.target.value)} style={{ ...selectStyle, marginLeft: "auto" }}>
          <option value="">All Fiscal Years</option>
          {fiscalYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="btn-secondary" onClick={onRefresh}>↺ Refresh</button>
      </div>

      {/* Summary counts */}
      {anomalies.counts?.length > 0 && (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
          {anomalies.counts.map((c, i) => (
            <div key={i} style={{ background: severityColor[c.severity] + "15", border: `1px solid ${severityColor[c.severity]}40`, borderRadius: "8px", padding: "0.6rem 1rem" }}>
              <p style={{ margin: 0, fontSize: "0.7rem", color: severityColor[c.severity], textTransform: "uppercase", fontWeight: 600 }}>{c.severity}</p>
              <strong style={{ fontSize: "1.1rem" }}>{c.count}</strong>
              <p style={{ margin: 0, fontSize: "0.7rem", color: "#6b7280" }}>{c.flag_type.replace(/_/g, " ")}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading anomalies…</p>
      ) : anomalies.flags?.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>
          <p style={{ fontSize: "2rem", margin: "0 0 0.5rem" }}>✅</p>
          <p>No unresolved anomaly flags for the selected period.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {anomalies.flags.map((f) => (
            <div key={f.id} style={{ border: `1px solid ${severityColor[f.severity]}40`, borderRadius: "8px", padding: "1rem 1.25rem", background: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.35rem" }}>
                    <span style={{ ...badgeStyle, background: severityColor[f.severity] + "20", color: severityColor[f.severity] }}>{f.severity}</span>
                    <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{f.flag_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                    {f.department_name && <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>— {f.department_name}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: "0.875rem" }}>{f.description}</p>
                  {f.request_title && (
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "#6b7280" }}>
                      Request: {f.request_title} · {fmt(f.requested_amount)}
                    </p>
                  )}
                </div>
                <button
                  style={{ marginLeft: "1rem", background: "none", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "0.3rem 0.7rem", cursor: "pointer", fontSize: "0.8rem", color: "#374151" }}
                  onClick={() => onResolve(f.id)}
                >
                  Resolve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryView({ summaryData, summaryLoading, filterFY, setFilterFY, fiscalYears = FB_FISCAL_YEARS, audienceLevel, setAudienceLevel, onGenerate }) {
  return (
    <div style={{ maxWidth: "800px" }}>
      <h3 style={{ margin: "0 0 1.25rem", fontWeight: 700 }}>Budget Requests Summary</h3>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem", alignItems: "flex-end" }}>
        <FormField label="Fiscal Year">
          <select value={filterFY} onChange={(e) => setFilterFY(e.target.value)} style={selectStyle}>
            <option value="">All Years</option>
            {fiscalYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </FormField>
        <FormField label="Audience Level">
          <select value={audienceLevel} onChange={(e) => setAudienceLevel(e.target.value)} style={selectStyle}>
            {AUDIENCE_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </FormField>
        <button className="btn-primary" onClick={onGenerate} disabled={summaryLoading}>
          {summaryLoading ? "Generating…" : "Generate Summary"}
        </button>
      </div>

      {summaryData && (
        <div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            {[
              { label: "Total Requests",   value: summaryData.requestCount },
              { label: "Total Requested",  value: fmt(summaryData.totalRequested) },
              { label: "High Risk",        value: summaryData.highRiskCount }
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.75rem 1rem" }}>
                <p style={{ margin: 0, fontSize: "0.7rem", color: "#6b7280", textTransform: "uppercase" }}>{label}</p>
                <strong style={{ fontSize: "1.1rem" }}>{value}</strong>
              </div>
            ))}
          </div>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "1.25rem" }}>
            <p style={{ margin: "0 0 0.5rem", fontWeight: 600, fontSize: "0.875rem", color: "#374151" }}>
              {AUDIENCE_LEVELS.find((a) => a.value === audienceLevel)?.label}
            </p>
            <div style={{ lineHeight: 1.7, fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{summaryData.summary}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ isSubmitter, onNew }) {
  return (
    <div style={{ textAlign: "center", padding: "4rem 2rem", color: "#6b7280" }}>
      <p style={{ fontSize: "2.5rem", margin: "0 0 0.5rem" }}>📋</p>
      <h4 style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>No budget requests yet</h4>
      <p style={{ margin: "0 0 1.25rem" }}>Budget requests submitted by departments will appear here.</p>
      {isSubmitter && (
        <button className="btn-primary" onClick={onNew}>Create First Request</button>
      )}
    </div>
  );
}

// ── Scoring Criteria Editor ───────────────────────────────────────────────────
function ScoringCriteriaEditor({ authToken, onBack }) {
  const [criteria, setCriteria] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");

  useEffect(() => {
    getScoringCriteria(authToken)
      .then((r) => setCriteria(r.criteria || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authToken]);

  function setWeight(key, val) {
    const num = Math.min(1, Math.max(0, parseFloat(val) || 0));
    setCriteria((prev) => prev.map((c) => c.key === key ? { ...c, weight: num } : c));
  }

  function toggleActive(key) {
    setCriteria((prev) => prev.map((c) => c.key === key ? { ...c, is_active: !c.is_active } : c));
  }

  async function handleSave() {
    // Normalize weights of active criteria to sum to 1.0
    const active = criteria.filter((c) => c.is_active);
    const totalW = active.reduce((s, c) => s + Number(c.weight), 0);
    if (totalW === 0) { setError("At least one criterion must be active with weight > 0."); return; }

    const updates = criteria.map((c) => ({
      key:      c.key,
      weight:   c.is_active ? Number((Number(c.weight) / totalW).toFixed(4)) : 0,
      isActive: c.is_active
    }));

    setSaving(true);
    try {
      const r = await updateScoringCriteria(authToken, updates);
      setCriteria(r.criteria || []);
      setSuccess("Scoring criteria saved. Weights normalized to sum to 1.0.");
      setTimeout(() => setSuccess(""), 3500);
    } catch (e) {
      setError(e.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const totalWeight = criteria.filter((c) => c.is_active).reduce((s, c) => s + Number(c.weight), 0);

  return (
    <div style={{ maxWidth: "760px" }}>
      <h3 style={{ margin: "0 0 0.25rem", fontWeight: 700 }}>Scoring Criteria Configuration</h3>
      <p style={{ margin: "0 0 1.5rem", color: "#6b7280", fontSize: "0.875rem" }}>
        Adjust the weight of each scoring dimension. Weights are normalized to sum to 1.0 on save.
        Inactive criteria are excluded from scoring.
      </p>

      {error   && <div style={alertStyle("#fef2f2", "#dc2626")}>{error}</div>}
      {success && <div style={alertStyle("#f0fdf4", "#16a34a")}>{success}</div>}

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading criteria…</p>
      ) : (
        <>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden", marginBottom: "1.25rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  {["Active", "Criteria", "Description", "Weight", "% of Total"].map((h) => (
                    <th key={h} style={{ ...thStyle, padding: "0.7rem 1rem" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {criteria.map((c) => {
                  const pct = totalWeight > 0 && c.is_active ? ((Number(c.weight) / totalWeight) * 100).toFixed(1) : "—";
                  return (
                    <tr key={c.key} style={{ borderBottom: "1px solid #f3f4f6", opacity: c.is_active ? 1 : 0.45 }}>
                      <td style={{ padding: "0.65rem 1rem", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={c.is_active}
                          onChange={() => toggleActive(c.key)}
                          style={{ width: "16px", height: "16px", cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "0.65rem 1rem" }}>
                        <strong style={{ fontSize: "0.85rem" }}>{c.label}</strong>
                        <p style={{ margin: 0, fontSize: "0.7rem", color: "#6b7280", fontFamily: "monospace" }}>{c.key}</p>
                      </td>
                      <td style={{ padding: "0.65rem 1rem", color: "#4b5563", fontSize: "0.8rem" }}>{c.description || "—"}</td>
                      <td style={{ padding: "0.65rem 1rem" }}>
                        <input
                          type="number"
                          min="0" max="1" step="0.01"
                          value={c.weight}
                          disabled={!c.is_active}
                          onChange={(e) => setWeight(c.key, e.target.value)}
                          style={{ width: "80px", padding: "0.3rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "4px", fontSize: "0.875rem" }}
                        />
                      </td>
                      <td style={{ padding: "0.65rem 1rem", fontWeight: 600, color: c.is_active ? "#2563eb" : "#9ca3af" }}>
                        {pct}{pct !== "—" ? "%" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.8rem", color: "#1e40af" }}>
            <strong>Note:</strong> On save, active weights are automatically normalized so they sum to 1.0.
            The AI scoring engine will use these weights when analyzing the next submitted budget request.
            Existing scores are not retroactively updated.
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Criteria"}
            </button>
            <button className="btn-secondary" onClick={onBack}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Utility components ────────────────────────────────────────────────────────
function FormField({ label, children, flex }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: flex || 1 }}>
      <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#435263" }}>{label}</label>
      {children}
    </div>
  );
}

function DetailCard({ title, badge, children }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "1rem 1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <h4 style={{ margin: 0, fontWeight: 700, fontSize: "0.9rem" }}>{title}</h4>
        {badge && <span style={{ fontSize: "0.7rem", color: "#6b7280" }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const alertStyle  = (bg, color) => ({ background: bg, border: `1px solid ${color}`, borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", color, fontSize: "0.875rem" });
const selectStyle = { padding: "10px 11px", border: "1px solid #d8dfe2", borderRadius: "10px", fontSize: "0.875rem", fontFamily: "inherit", color: "#1a2332", background: "#fff", cursor: "pointer" };
const inputStyle  = { padding: "10px 11px", border: "1px solid #d8dfe2", borderRadius: "10px", fontSize: "0.875rem", fontFamily: "inherit", color: "#1a2332", background: "#fff", width: "100%", boxSizing: "border-box" };
const tableStyle  = { width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" };
const thStyle     = { padding: "0.6rem 0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" };
const tdStyle     = { padding: "0.75rem", verticalAlign: "middle" };
const badgeStyle  = { display: "inline-flex", alignItems: "center", padding: "0.2rem 0.6rem", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 600 };
const fieldsetStyle = { border: "1px solid #e5e7eb", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1rem" };
const legendStyle   = { padding: "0 0.5rem", fontWeight: 700, fontSize: "0.875rem", color: "#374151" };
const formRowStyle  = { display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" };
const scoreColor = (s) => s >= 7 ? "#16a34a" : s >= 4 ? "#d97706" : "#dc2626";
