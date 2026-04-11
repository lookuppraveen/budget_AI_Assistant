import { useEffect, useState, useCallback } from "react";
import { useMasterData } from "../../hooks/useMasterData.js";
import {
  listScenarios, createScenario, updateScenario, deleteScenario, compareScenarios
} from "../../services/scenariosApi.js";

const FB_FISCAL_YEARS = ["FY28", "FY27", "FY26", "FY25", "FY24"];
const SCENARIO_TYPES  = ["best", "expected", "constrained", "custom"];
const TYPE_COLOR      = { best: "#16a34a", expected: "#2563eb", constrained: "#dc2626", custom: "#7c3aed" };

const fmt = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtNum = (n) => Number(n || 0).toLocaleString();

const EMPTY_FORM = {
  name: "", scenarioType: "expected", description: "", fiscalYear: "FY27",
  baseRevenue: "", enrollmentChangePct: "0", tuitionChangePct: "0",
  stateFundingChangePct: "0", salaryPoolPct: "2.5", hiringFreeze: false,
  capitalDeferralPct: "0", otherExpenseChangePct: "0"
};

export function ScenarioPlanningPanel({ authToken, userRole }) {
  const { values: FISCAL_YEARS } = useMasterData(authToken, "Fiscal Year", FB_FISCAL_YEARS);

  const [scenarios, setScenarios]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [view, setView]               = useState("list");     // list | form | detail | compare
  const [editing, setEditing]         = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState(null);
  const [filterFY, setFilterFY]       = useState("");
  const [selected, setSelected]       = useState([]);        // ids for compare
  const [compareData, setCompareData] = useState([]);
  const [comparing, setComparing]     = useState(false);
  const [detail, setDetail]           = useState(null);

  const canWrite = ["Admin", "Budget Analyst"].includes(userRole);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listScenarios(authToken, { fiscalYear: filterFY || undefined });
      setScenarios(data.scenarios || []);
    } catch (e) {
      setError(e.message || "Failed to load scenarios");
    } finally {
      setLoading(false);
    }
  }, [authToken, filterFY]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(null); setView("form"); };
  const openEdit   = (s)  => { setEditing(s); setForm({
    name: s.name, scenarioType: s.scenarioType, description: s.description || "",
    fiscalYear: s.fiscalYear, baseRevenue: String(s.baseRevenue),
    enrollmentChangePct: String(s.enrollmentChangePct), tuitionChangePct: String(s.tuitionChangePct),
    stateFundingChangePct: String(s.stateFundingChangePct), salaryPoolPct: String(s.salaryPoolPct),
    hiringFreeze: s.hiringFreeze, capitalDeferralPct: String(s.capitalDeferralPct),
    otherExpenseChangePct: String(s.otherExpenseChangePct)
  }); setFormError(null); setView("form"); };
  const openDetail = (s) => { setDetail(s); setView("detail"); };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    if (!form.fiscalYear)  { setFormError("Fiscal year is required"); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        ...form,
        baseRevenue: parseFloat(form.baseRevenue) || 0,
        enrollmentChangePct: parseFloat(form.enrollmentChangePct) || 0,
        tuitionChangePct: parseFloat(form.tuitionChangePct) || 0,
        stateFundingChangePct: parseFloat(form.stateFundingChangePct) || 0,
        salaryPoolPct: parseFloat(form.salaryPoolPct) || 2.5,
        capitalDeferralPct: parseFloat(form.capitalDeferralPct) || 0,
        otherExpenseChangePct: parseFloat(form.otherExpenseChangePct) || 0,
      };
      if (editing) {
        await updateScenario(authToken, editing.id, payload);
      } else {
        await createScenario(authToken, payload);
      }
      setView("list");
      load();
    } catch (e) {
      setFormError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this scenario?")) return;
    try {
      await deleteScenario(authToken, id);
      load();
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleCompare = async () => {
    if (selected.length < 2) { alert("Select at least 2 scenarios to compare"); return; }
    setComparing(true);
    try {
      const data = await compareScenarios(authToken, selected);
      setCompareData(data.scenarios || []);
      setView("compare");
    } catch (e) {
      alert(e.message || "Compare failed");
    } finally {
      setComparing(false);
    }
  };

  const f = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  // ── Compare view ──────────────────────────────────────────────────────────────
  if (view === "compare") {
    const metrics = [
      { label: "Base Revenue",         key: "baseRevenue" },
      { label: "Projected Revenue",    key: "projectedRevenue" },
      { label: "Projected Expense",    key: "projectedExpense" },
      { label: "Surplus / Deficit",    key: "projectedSurplusDeficit" },
      { label: "Base Expense",         key: "baseExpense" },
      { label: "Enrollment Δ%",        key: "enrollmentChangePct", pct: true },
      { label: "Tuition Δ%",           key: "tuitionChangePct", pct: true },
      { label: "State Funding Δ%",     key: "stateFundingChangePct", pct: true },
      { label: "Salary Pool %",        key: "salaryPoolPct", pct: true },
      { label: "Capital Deferral %",   key: "capitalDeferralPct", pct: true },
      { label: "Other Expense Δ%",     key: "otherExpenseChangePct", pct: true },
    ];
    return (
      <div className="panel active" style={{ padding: "24px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
          <button onClick={() => { setView("list"); setCompareData([]); setSelected([]); }}
            style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer" }}>
            ← Back
          </button>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Scenario Comparison</h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>Metric</th>
                {compareData.map((s) => (
                  <th key={s.id} style={{ padding: "10px 12px", textAlign: "right", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 12, background: TYPE_COLOR[s.scenarioType] + "20", color: TYPE_COLOR[s.scenarioType], fontSize: 11, fontWeight: 600 }}>{s.scenarioType}</span>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>{s.name}</div>
                    <div style={{ color: "#6b7280", fontWeight: 400 }}>{s.fiscalYear}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, i) => (
                <tr key={m.key} style={{ background: i % 2 ? "#f9fafb" : "white" }}>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151", fontWeight: 500 }}>{m.label}</td>
                  {compareData.map((s) => {
                    const val = s[m.key];
                    const num = Number(val);
                    const isNeg = num < 0;
                    return (
                      <td key={s.id} style={{ padding: "9px 12px", textAlign: "right", borderBottom: "1px solid #f3f4f6", color: m.key === "projectedSurplusDeficit" ? (isNeg ? "#dc2626" : "#16a34a") : "#111827", fontWeight: m.key === "projectedSurplusDeficit" ? 700 : 400 }}>
                        {m.pct ? `${num > 0 ? "+" : ""}${num}%` : fmt(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Revenue / Expense breakdown side by side */}
        {compareData.some((s) => s.revenueBreakdown) && (
          <div style={{ marginTop: 28 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Revenue & Expense Breakdown</h3>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${compareData.length}, 1fr)`, gap: 16 }}>
              {compareData.map((s) => (
                <div key={s.id} style={{ background: "#f9fafb", borderRadius: 8, padding: 16, border: "1px solid #e5e7eb" }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: TYPE_COLOR[s.scenarioType] }}>{s.name}</div>
                  {s.revenueBreakdown && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Revenue</div>
                      {Object.entries(s.revenueBreakdown).map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                          <span style={{ textTransform: "capitalize" }}>{k}</span>
                          <span style={{ fontWeight: 600 }}>{fmt(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.expenseBreakdown && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>Expense</div>
                      {Object.entries(s.expenseBreakdown).map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                          <span style={{ textTransform: "capitalize" }}>{k}</span>
                          <span style={{ fontWeight: 600 }}>{fmt(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Detail view ───────────────────────────────────────────────────────────────
  if (view === "detail" && detail) {
    const s = detail;
    const surplus = Number(s.projectedSurplusDeficit);
    return (
      <div className="panel active" style={{ padding: "24px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
          <button onClick={() => setView("list")}
            style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer" }}>
            ← Back
          </button>
          {canWrite && (
            <button onClick={() => openEdit(s)}
              style={{ padding: "6px 14px", border: "1px solid #2563eb", borderRadius: 6, background: "#2563eb", color: "white", cursor: "pointer" }}>
              Edit
            </button>
          )}
          <span style={{ padding: "3px 10px", borderRadius: 12, background: TYPE_COLOR[s.scenarioType] + "20", color: TYPE_COLOR[s.scenarioType], fontSize: 12, fontWeight: 600 }}>
            {s.scenarioType}
          </span>
        </div>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>{s.name}</h2>
        <p style={{ color: "#6b7280", margin: "0 0 24px" }}>{s.fiscalYear}{s.description ? ` — ${s.description}` : ""}</p>

        {/* Headline metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Projected Revenue",  value: fmt(s.projectedRevenue), color: "#2563eb" },
            { label: "Projected Expense",  value: fmt(s.projectedExpense), color: "#d97706" },
            { label: surplus >= 0 ? "Projected Surplus" : "Projected Deficit", value: fmt(Math.abs(surplus)), color: surplus >= 0 ? "#16a34a" : "#dc2626" },
          ].map((m) => (
            <div key={m.label} style={{ background: "#f9fafb", borderRadius: 10, padding: 20, border: `2px solid ${m.color}30` }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Assumptions */}
        <div style={{ background: "#f9fafb", borderRadius: 10, padding: 20, marginBottom: 20, border: "1px solid #e5e7eb" }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Assumptions</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {[
              { label: "Base Revenue",       value: fmt(s.baseRevenue) },
              { label: "Base Expense",       value: fmt(s.baseExpense) },
              { label: "Enrollment Δ",       value: `${s.enrollmentChangePct}%` },
              { label: "Tuition Δ",          value: `${s.tuitionChangePct}%` },
              { label: "State Funding Δ",    value: `${s.stateFundingChangePct}%` },
              { label: "Salary Pool",        value: `${s.salaryPoolPct}%` },
              { label: "Hiring Freeze",      value: s.hiringFreeze ? "Yes" : "No" },
              { label: "Capital Deferral",   value: `${s.capitalDeferralPct}%` },
              { label: "Other Expense Δ",    value: `${s.otherExpenseChangePct}%` },
            ].map((a) => (
              <div key={a.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                <span style={{ color: "#6b7280" }}>{a.label}</span>
                <span style={{ fontWeight: 600 }}>{a.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Breakdowns */}
        {(s.revenueBreakdown || s.expenseBreakdown) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {s.revenueBreakdown && (
              <div style={{ background: "#f9fafb", borderRadius: 10, padding: 20, border: "1px solid #e5e7eb" }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#2563eb" }}>Revenue Breakdown</h3>
                {Object.entries(s.revenueBreakdown).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                    <span style={{ textTransform: "capitalize", color: "#374151" }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{fmt(v)}</span>
                  </div>
                ))}
              </div>
            )}
            {s.expenseBreakdown && (
              <div style={{ background: "#f9fafb", borderRadius: 10, padding: 20, border: "1px solid #e5e7eb" }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#d97706" }}>Expense Breakdown</h3>
                {Object.entries(s.expenseBreakdown).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
                    <span style={{ textTransform: "capitalize", color: "#374151" }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{fmt(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 16, color: "#9ca3af", fontSize: 12 }}>
          Created by {s.createdByName || "unknown"} · {new Date(s.createdAt).toLocaleDateString()}
          {s.updatedAt && ` · Updated ${new Date(s.updatedAt).toLocaleDateString()}`}
        </div>
      </div>
    );
  }

  // ── Form view ─────────────────────────────────────────────────────────────────
  if (view === "form") {
    const isEdit = !!editing;
    return (
      <div className="panel active" style={{ padding: "24px", maxWidth: 780 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
          <button onClick={() => setView("list")}
            style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer" }}>
            ← Back
          </button>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{isEdit ? "Edit Scenario" : "New Scenario"}</h2>
        </div>
        {formError && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{formError}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelSt}>Name *</label>
            <input value={form.name} onChange={f("name")} style={inputSt} placeholder="e.g. FY27 Constrained Budget" />
          </div>
          <div>
            <label style={labelSt}>Fiscal Year *</label>
            <select value={form.fiscalYear} onChange={f("fiscalYear")} style={inputSt}>
              {FISCAL_YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={labelSt}>Scenario Type</label>
            <select value={form.scenarioType} onChange={f("scenarioType")} style={inputSt}>
              {SCENARIO_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelSt}>Description</label>
            <textarea value={form.description} onChange={f("description")} rows={2} style={{ ...inputSt, resize: "vertical" }} />
          </div>
        </div>

        {/* Revenue assumptions */}
        <div style={sectionSt}>
          <h3 style={sectionHeaderSt}>Revenue Assumptions</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelSt}>Base Revenue ($)</label>
              <input type="number" value={form.baseRevenue} onChange={f("baseRevenue")} style={inputSt} placeholder="0" />
            </div>
            <div>
              <label style={labelSt}>Enrollment Δ (%)</label>
              <input type="number" value={form.enrollmentChangePct} onChange={f("enrollmentChangePct")} style={inputSt} step="0.1" />
            </div>
            <div>
              <label style={labelSt}>Tuition Δ (%)</label>
              <input type="number" value={form.tuitionChangePct} onChange={f("tuitionChangePct")} style={inputSt} step="0.1" />
            </div>
            <div>
              <label style={labelSt}>State Funding Δ (%)</label>
              <input type="number" value={form.stateFundingChangePct} onChange={f("stateFundingChangePct")} style={inputSt} step="0.1" />
            </div>
          </div>
        </div>

        {/* Expense assumptions */}
        <div style={sectionSt}>
          <h3 style={sectionHeaderSt}>Expense Assumptions</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelSt}>Salary Pool (%)</label>
              <input type="number" value={form.salaryPoolPct} onChange={f("salaryPoolPct")} style={inputSt} step="0.1" />
            </div>
            <div>
              <label style={labelSt}>Capital Deferral (%)</label>
              <input type="number" value={form.capitalDeferralPct} onChange={f("capitalDeferralPct")} style={inputSt} step="0.1" />
            </div>
            <div>
              <label style={labelSt}>Other Expense Δ (%)</label>
              <input type="number" value={form.otherExpenseChangePct} onChange={f("otherExpenseChangePct")} style={inputSt} step="0.1" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 20 }}>
              <input type="checkbox" id="hf" checked={form.hiringFreeze} onChange={f("hiringFreeze")} style={{ width: 16, height: 16, cursor: "pointer" }} />
              <label htmlFor="hf" style={{ fontSize: 13, color: "#374151", cursor: "pointer" }}>Hiring Freeze</label>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: "9px 22px", background: saving ? "#93c5fd" : "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer", fontWeight: 600 }}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Scenario"}
          </button>
          <button onClick={() => setView("list")} style={{ padding: "9px 18px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <div className="panel active" style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Scenario Planning</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={filterFY} onChange={(e) => setFilterFY(e.target.value)}
            style={{ padding: "10px 11px", border: "1px solid #d8dfe2", borderRadius: 10, fontSize: "0.875rem", fontFamily: "inherit", color: "#1a2332", background: "#fff" }}>
            <option value="">All Fiscal Years</option>
            {FISCAL_YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
          {selected.length >= 2 && (
            <button onClick={handleCompare} disabled={comparing}
              style={{ padding: "7px 16px", background: "#7c3aed", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              {comparing ? "Comparing…" : `Compare (${selected.length})`}
            </button>
          )}
          {canWrite && (
            <button onClick={openCreate}
              style={{ padding: "7px 16px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              + New Scenario
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "12px 16px", borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>Loading scenarios…</div>
      ) : scenarios.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 600 }}>No scenarios yet</div>
          {canWrite && <div style={{ fontSize: 13, marginTop: 6 }}>Create your first scenario to model budget outcomes.</div>}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {scenarios.map((s) => {
            const surplus = Number(s.projectedSurplusDeficit);
            const isSelected = selected.includes(s.id);
            return (
              <div key={s.id} style={{ background: "white", border: `2px solid ${isSelected ? "#7c3aed" : "#e5e7eb"}`, borderRadius: 12, padding: "18px 20px", cursor: "pointer", transition: "box-shadow 0.15s" }}
                onClick={() => openDetail(s)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <input type="checkbox" checked={isSelected} onClick={(e) => { e.stopPropagation(); toggleSelect(s.id); }}
                        style={{ width: 16, height: 16, cursor: "pointer" }} />
                      <span style={{ padding: "2px 8px", borderRadius: 12, background: TYPE_COLOR[s.scenarioType] + "20", color: TYPE_COLOR[s.scenarioType], fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                        {s.scenarioType}
                      </span>
                      <span style={{ fontSize: 12, color: "#9ca3af" }}>{s.fiscalYear}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{s.name}</div>
                    {s.description && <div style={{ fontSize: 13, color: "#6b7280" }}>{s.description}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
                    {s.projectedSurplusDeficit !== null && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{surplus >= 0 ? "Surplus" : "Deficit"}</div>
                        <div style={{ fontWeight: 800, fontSize: 18, color: surplus >= 0 ? "#16a34a" : "#dc2626" }}>
                          {fmt(Math.abs(surplus))}
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      {canWrite && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                            style={{ padding: "5px 12px", border: "1px solid #2563eb", borderRadius: 6, background: "white", color: "#2563eb", cursor: "pointer", fontSize: 12 }}>
                            Edit
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                            style={{ padding: "5px 12px", border: "1px solid #dc2626", borderRadius: 6, background: "white", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {(s.projectedRevenue !== null) && (
                  <div style={{ display: "flex", gap: 20, marginTop: 12, paddingTop: 12, borderTop: "1px solid #f3f4f6", fontSize: 12 }}>
                    <span style={{ color: "#6b7280" }}>Revenue: <strong>{fmt(s.projectedRevenue)}</strong></span>
                    <span style={{ color: "#6b7280" }}>Expense: <strong>{fmt(s.projectedExpense)}</strong></span>
                    <span style={{ color: "#6b7280" }}>Base: <strong>{fmt(s.baseRevenue)}</strong></span>
                    {s.createdByName && <span style={{ color: "#9ca3af" }}>by {s.createdByName}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const labelSt = { display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#435263", marginBottom: 6 };
const inputSt = { width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "1px solid #d8dfe2", borderRadius: 10, fontSize: "0.875rem", fontFamily: "inherit", color: "#1a2332", background: "#fff" };
const sectionSt = { background: "#f9fafb", borderRadius: 10, padding: "16px 18px", marginBottom: 16, border: "1px solid #e5e7eb" };
const sectionHeaderSt = { margin: "0 0 14px", fontSize: "0.78rem", fontWeight: 700, color: "#435263", textTransform: "uppercase", letterSpacing: "0.06em" };
