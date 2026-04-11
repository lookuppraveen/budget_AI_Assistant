import { useState, useCallback } from "react";
import { useMasterData } from "../../hooks/useMasterData.js";
import {
  getTalkingPoints, getVarianceExplanation,
  listDecisionLog, createDecisionEntry, deleteDecisionEntry
} from "../../services/scenariosApi.js";

const FB_FISCAL_YEARS = ["FY28", "FY27", "FY26", "FY25", "FY24"];
const ENTRY_TYPES  = ["budget_request", "policy", "strategic", "operational", "other"];
const TYPE_LABELS  = { budget_request: "Budget Request", policy: "Policy", strategic: "Strategic", operational: "Operational", other: "Other" };
const TYPE_COLOR   = { budget_request: "#2563eb", policy: "#7c3aed", strategic: "#16a34a", operational: "#d97706", other: "#6b7280" };

const fmt = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const TABS = [
  { id: "talking-points",  label: "Talking Points" },
  { id: "variance",        label: "Variance Analysis" },
  { id: "decision-log",    label: "Decision Log" },
];

const EMPTY_LOG_FORM = {
  entryType: "other", subject: "", context: "", decision: "",
  rationale: "", alternativesConsidered: "", assumptions: "", outcome: "",
  fiscalYear: "FY27", decidedAt: new Date().toISOString().slice(0, 10)
};

export function ExecutiveCopilotPanel({ authToken, userRole }) {
  const { values: FISCAL_YEARS } = useMasterData(authToken, "Fiscal Year", FB_FISCAL_YEARS);

  const [tab, setTab]           = useState("talking-points");
  const [fy, setFy]             = useState("FY27");
  const [loading, setLoading]   = useState(false);
  const [tpData, setTpData]     = useState(null);
  const [varData, setVarData]   = useState(null);
  const [logData, setLogData]   = useState(null);
  const [error, setError]       = useState(null);

  // Decision log form
  const [logView, setLogView]     = useState("list");  // list | form
  const [logForm, setLogForm]     = useState(EMPTY_LOG_FORM);
  const [logSaving, setLogSaving] = useState(false);
  const [logError, setLogError]   = useState(null);

  const canWrite = ["Admin", "Budget Analyst"].includes(userRole);

  const loadTalkingPoints = useCallback(async () => {
    setLoading(true); setError(null); setTpData(null);
    try { setTpData(await getTalkingPoints(authToken, fy)); }
    catch (e) { setError(e.message || "Failed to load talking points"); }
    finally { setLoading(false); }
  }, [authToken, fy]);

  const loadVariance = useCallback(async () => {
    setLoading(true); setError(null); setVarData(null);
    try { setVarData(await getVarianceExplanation(authToken, fy)); }
    catch (e) { setError(e.message || "Failed to load variance"); }
    finally { setLoading(false); }
  }, [authToken, fy]);

  const loadLog = useCallback(async () => {
    setLoading(true); setError(null); setLogData(null);
    try {
      const data = await listDecisionLog(authToken, { fiscalYear: fy || undefined });
      setLogData(data);
    }
    catch (e) { setError(e.message || "Failed to load decision log"); }
    finally { setLoading(false); }
  }, [authToken, fy]);

  const handleTabChange = (newTab) => {
    setTab(newTab); setError(null);
    if (newTab === "talking-points") loadTalkingPoints();
    if (newTab === "variance")       loadVariance();
    if (newTab === "decision-log")   loadLog();
  };

  const handleFyChange = (newFy) => {
    setFy(newFy);
    if (tab === "talking-points") setTimeout(() => loadTalkingPoints(), 0);
    if (tab === "variance")       setTimeout(() => loadVariance(), 0);
    if (tab === "decision-log")   setTimeout(() => loadLog(), 0);
  };

  const handleSaveLog = async () => {
    if (!logForm.subject.trim()) { setLogError("Subject is required"); return; }
    if (!logForm.decision.trim()) { setLogError("Decision is required"); return; }
    setLogSaving(true); setLogError(null);
    try {
      await createDecisionEntry(authToken, logForm);
      setLogView("list");
      loadLog();
    } catch (e) { setLogError(e.message || "Save failed"); }
    finally { setLogSaving(false); }
  };

  const handleDeleteLog = async (id) => {
    if (!window.confirm("Delete this decision log entry?")) return;
    try { await deleteDecisionEntry(authToken, id); loadLog(); }
    catch (e) { alert(e.message || "Delete failed"); }
  };

  const lf = (key) => (e) => setLogForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="panel active" style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Executive Copilot</h2>
        <select value={fy} onChange={(e) => handleFyChange(e.target.value)}
          style={{ padding: "10px 11px", border: "1px solid #d8dfe2", borderRadius: 10, fontSize: "0.875rem", fontFamily: "inherit", color: "#1a2332", background: "#fff" }}>
          {FISCAL_YEARS.map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e5e7eb", marginBottom: 24 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => handleTabChange(t.id)}
            style={{ padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
              color: tab === t.id ? "#2563eb" : "#6b7280",
              borderBottom: tab === t.id ? "2px solid #2563eb" : "2px solid transparent", marginBottom: -2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "12px 16px", borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {/* ── Talking Points ── */}
      {tab === "talking-points" && (
        <div>
          {!tpData && !loading && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <button onClick={loadTalkingPoints}
                style={{ padding: "12px 28px", background: "#2563eb", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 15 }}>
                Generate {fy} Talking Points
              </button>
              <p style={{ color: "#9ca3af", marginTop: 12, fontSize: 13 }}>Generates board-ready talking points from live budget data.</p>
            </div>
          )}
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>Generating talking points…</div>}
          {tpData && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: "#9ca3af" }}>
                  Generated {new Date(tpData.generatedAt).toLocaleString()} for {tpData.fiscalYear}
                </div>
                <button onClick={loadTalkingPoints}
                  style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer", fontSize: 12 }}>
                  Refresh
                </button>
              </div>
              <div style={{ display: "grid", gap: 14 }}>
                {tpData.talkingPoints.map((tp, i) => (
                  <div key={i} style={{ background: "#f9fafb", borderRadius: 10, padding: "16px 20px", border: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      {tp.category}
                    </div>
                    <div style={{ fontSize: 15, color: "#111827", lineHeight: 1.6 }}>{tp.point}</div>
                  </div>
                ))}
              </div>
              {tpData.talkingPoints.length === 0 && (
                <p style={{ color: "#9ca3af", textAlign: "center" }}>No data available for {tpData.fiscalYear} yet.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Variance Analysis ── */}
      {tab === "variance" && (
        <div>
          {!varData && !loading && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <button onClick={loadVariance}
                style={{ padding: "12px 28px", background: "#2563eb", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 15 }}>
                Generate {fy} Variance Report
              </button>
              <p style={{ color: "#9ca3af", marginTop: 12, fontSize: 13 }}>Compares approved budgets year-over-year and by department.</p>
            </div>
          )}
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>Analyzing variance…</div>}
          {varData && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: "#9ca3af" }}>Generated {new Date(varData.generatedAt).toLocaleString()}</div>
                <button onClick={loadVariance}
                  style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer", fontSize: 12 }}>
                  Refresh
                </button>
              </div>

              {/* Headline */}
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "18px 20px", marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#0369a1" }}>{varData.headline}</div>
                <div style={{ display: "flex", gap: 28, marginTop: 14, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Current ({varData.fiscalYear}) Approved</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>{fmt(varData.currentApproved)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Prior Year Approved</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>{fmt(varData.previousApproved)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Delta</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: varData.delta >= 0 ? "#16a34a" : "#dc2626" }}>
                      {varData.delta >= 0 ? "+" : ""}{fmt(varData.delta)}
                      {varData.pctChange && ` (${varData.delta >= 0 ? "+" : ""}${varData.pctChange}%)`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Department variances */}
              {varData.departmentVariances.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Department Variances (Top 5 by change)</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                        {["Department", "Current", "Previous", "Delta", "% Change"].map((h) => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: h === "Department" ? "left" : "right", fontWeight: 700, color: "#374151" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {varData.departmentVariances.map((d, i) => (
                        <tr key={d.department} style={{ background: i % 2 ? "#f9fafb" : "white", borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "9px 12px", fontWeight: 600 }}>{d.department}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>{fmt(d.current)}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>{fmt(d.previous)}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: d.delta >= 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                            {d.delta >= 0 ? "+" : ""}{fmt(d.delta)}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: d.pctChange !== null ? (d.delta >= 0 ? "#16a34a" : "#dc2626") : "#9ca3af" }}>
                            {d.pctChange !== null ? `${d.delta >= 0 ? "+" : ""}${d.pctChange}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Decision Log ── */}
      {tab === "decision-log" && (
        <div>
          {logView === "form" ? (
            <div style={{ maxWidth: 700 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
                <button onClick={() => setLogView("list")}
                  style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer" }}>
                  ← Back
                </button>
                <h3 style={{ margin: 0, fontWeight: 700 }}>New Decision Log Entry</h3>
              </div>
              {logError && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{logError}</div>}
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={labelSt}>Entry Type</label>
                    <select value={logForm.entryType} onChange={lf("entryType")} style={inputSt}>
                      {ENTRY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelSt}>Fiscal Year</label>
                    <select value={logForm.fiscalYear} onChange={lf("fiscalYear")} style={inputSt}>
                      {FISCAL_YEARS.map((y) => <option key={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelSt}>Subject *</label>
                  <input value={logForm.subject} onChange={lf("subject")} style={inputSt} placeholder="e.g. FY27 Capital Projects Review" />
                </div>
                <div>
                  <label style={labelSt}>Decision *</label>
                  <textarea value={logForm.decision} onChange={lf("decision")} rows={3} style={{ ...inputSt, resize: "vertical" }} placeholder="What was decided?" />
                </div>
                <div>
                  <label style={labelSt}>Rationale</label>
                  <textarea value={logForm.rationale} onChange={lf("rationale")} rows={2} style={{ ...inputSt, resize: "vertical" }} placeholder="Why was this decision made?" />
                </div>
                <div>
                  <label style={labelSt}>Alternatives Considered</label>
                  <textarea value={logForm.alternativesConsidered} onChange={lf("alternativesConsidered")} rows={2} style={{ ...inputSt, resize: "vertical" }} />
                </div>
                <div>
                  <label style={labelSt}>Context / Background</label>
                  <textarea value={logForm.context} onChange={lf("context")} rows={2} style={{ ...inputSt, resize: "vertical" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={labelSt}>Assumptions</label>
                    <textarea value={logForm.assumptions} onChange={lf("assumptions")} rows={2} style={{ ...inputSt, resize: "vertical" }} />
                  </div>
                  <div>
                    <label style={labelSt}>Outcome (fill in later)</label>
                    <textarea value={logForm.outcome} onChange={lf("outcome")} rows={2} style={{ ...inputSt, resize: "vertical" }} />
                  </div>
                </div>
                <div>
                  <label style={labelSt}>Decided At</label>
                  <input type="date" value={logForm.decidedAt} onChange={lf("decidedAt")} style={{ ...inputSt, width: "auto" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button onClick={handleSaveLog} disabled={logSaving}
                  style={{ padding: "9px 22px", background: logSaving ? "#93c5fd" : "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: logSaving ? "not-allowed" : "pointer", fontWeight: 600 }}>
                  {logSaving ? "Saving…" : "Save Entry"}
                </button>
                <button onClick={() => setLogView("list")} style={{ padding: "9px 18px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ color: "#6b7280", fontSize: 13 }}>
                  {logData ? `${logData.total} entries` : ""}
                </span>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={loadLog}
                    style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer", fontSize: 12 }}>
                    Refresh
                  </button>
                  {canWrite && (
                    <button onClick={() => { setLogForm({ ...EMPTY_LOG_FORM, fiscalYear: fy }); setLogError(null); setLogView("form"); }}
                      style={{ padding: "6px 16px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                      + Add Entry
                    </button>
                  )}
                </div>
              </div>
              {!logData && !loading && (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <button onClick={loadLog}
                    style={{ padding: "12px 28px", background: "#2563eb", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 15 }}>
                    Load Decision Log
                  </button>
                </div>
              )}
              {loading && <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>Loading…</div>}
              {logData && logData.entries.length === 0 && (
                <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                  <div style={{ fontWeight: 600 }}>No decision log entries yet</div>
                  {canWrite && <div style={{ fontSize: 13, marginTop: 6 }}>Capture institutional decisions and rationale for future reference.</div>}
                </div>
              )}
              {logData && logData.entries.length > 0 && (
                <div style={{ display: "grid", gap: 12 }}>
                  {logData.entries.map((e) => (
                    <div key={e.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                            <span style={{ padding: "2px 8px", borderRadius: 12, background: TYPE_COLOR[e.entryType] + "20", color: TYPE_COLOR[e.entryType], fontSize: 11, fontWeight: 700 }}>
                              {TYPE_LABELS[e.entryType] || e.entryType}
                            </span>
                            {e.fiscalYear && <span style={{ fontSize: 12, color: "#9ca3af" }}>{e.fiscalYear}</span>}
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>{new Date(e.decidedAt).toLocaleDateString()}</span>
                            {e.decidedByName && <span style={{ fontSize: 12, color: "#9ca3af" }}>by {e.decidedByName}</span>}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{e.subject}</div>
                          <div style={{ fontSize: 13, color: "#374151", marginBottom: e.rationale ? 6 : 0 }}>{e.decision}</div>
                          {e.rationale && <div style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>Rationale: {e.rationale}</div>}
                          {e.requestTitle && <div style={{ fontSize: 12, color: "#2563eb", marginTop: 4 }}>Linked request: {e.requestTitle}</div>}
                        </div>
                        {canWrite && (
                          <button onClick={() => handleDeleteLog(e.id)}
                            style={{ padding: "4px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "white", color: "#9ca3af", cursor: "pointer", fontSize: 12, flexShrink: 0 }}>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const labelSt = { display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#435263", marginBottom: 6 };
const inputSt = { width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "1px solid #d8dfe2", borderRadius: 10, fontSize: "0.875rem", fontFamily: "inherit", color: "#1a2332", background: "#fff" };
