import { useEffect, useState } from "react";
import {
  listScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  runScheduledReportNow
} from "../../services/schedulerApi.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const REPORT_TYPES = [
  { value: "budget_summary",   label: "Budget Summary" },
  { value: "request_pipeline", label: "Request Pipeline" },
  { value: "anomaly_report",   label: "Anomaly Report" },
  { value: "forecast",         label: "Multi-Year Forecast" }
];

const FREQUENCIES = [
  { value: "daily",   label: "Daily (07:00 CT)" },
  { value: "weekly",  label: "Weekly (Mon 07:00 CT)" },
  { value: "monthly", label: "Monthly (1st 07:00 CT)" }
];

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  card: {
    background: "#fff", border: "1px solid #e0e4ea", borderRadius: 8,
    padding: "20px 22px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
  },
  badge: (active) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: 10,
    fontSize: "0.7rem", fontWeight: 600,
    background: active ? "#e8f8f0" : "#f3f4f6",
    color: active ? "#27ae60" : "#888"
  }),
  statusBadge: (status) => {
    const cfg = {
      success: { bg: "#e8f8f0", color: "#27ae60" },
      failed:  { bg: "#fff0f0", color: "#e74c3c" },
      pending: { bg: "#fff8e6", color: "#f39c12" }
    }[status] || { bg: "#f3f4f6", color: "#888" };
    return {
      display: "inline-block", padding: "2px 8px", borderRadius: 10,
      fontSize: "0.7rem", fontWeight: 600, ...cfg
    };
  },
  btn: {
    padding: "7px 14px", borderRadius: 5, border: "none",
    fontSize: "0.8rem", fontWeight: 500, cursor: "pointer"
  },
  primaryBtn: { background: "#003a70", color: "#fff" },
  dangerBtn:  { background: "none", border: "1px solid #e74c3c", color: "#e74c3c" },
  ghostBtn:   { background: "none", border: "1px solid #cdd3da", color: "#555" },
  label:      { fontSize: "0.78rem", fontWeight: 600, color: "#444", display: "block", marginBottom: 4 },
  input:      {
    width: "100%", padding: "7px 10px", border: "1px solid #cdd3da",
    borderRadius: 5, fontSize: "0.83rem", outline: "none", boxSizing: "border-box"
  },
  select:     {
    width: "100%", padding: "7px 10px", border: "1px solid #cdd3da",
    borderRadius: 5, fontSize: "0.83rem", outline: "none", boxSizing: "border-box",
    background: "#fff"
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function typeLabel(v) { return REPORT_TYPES.find((r) => r.value === v)?.label || v; }
function freqLabel(v) { return FREQUENCIES.find((f) => f.value === v)?.label || v; }

// ── Form component ────────────────────────────────────────────────────────────
function ScheduleForm({ initial, onSave, onCancel, saving }) {
  const [name,        setName]        = useState(initial?.name || "");
  const [reportType,  setReportType]  = useState(initial?.report_type || "budget_summary");
  const [frequency,   setFrequency]   = useState(initial?.frequency || "weekly");
  const [recipientIn, setRecipientIn] = useState("");
  const [recipients,  setRecipients]  = useState(
    Array.isArray(initial?.recipients) ? initial.recipients : []
  );
  const [fiscalYear,  setFiscalYear]  = useState(initial?.filters?.fiscalYear || "");

  function addRecipient() {
    const e = recipientIn.trim().toLowerCase();
    if (!e || !e.includes("@") || recipients.includes(e)) return;
    setRecipients((prev) => [...prev, e]);
    setRecipientIn("");
  }

  function removeRecipient(email) {
    setRecipients((prev) => prev.filter((r) => r !== email));
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    if (!name.trim() || !recipients.length) return;
    onSave({
      name: name.trim(),
      reportType,
      frequency,
      recipients,
      filters: fiscalYear ? { fiscalYear } : {}
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <label style={S.label}>Schedule Name *</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weekly Pipeline Digest" required />
        </div>
        <div>
          <label style={S.label}>Report Type *</label>
          <select style={S.select} value={reportType} onChange={(e) => setReportType(e.target.value)}>
            {REPORT_TYPES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>Frequency *</label>
          <select style={S.select} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>Fiscal Year Filter (optional)</label>
          <input style={S.input} value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)}
            placeholder="e.g. FY2026" />
        </div>
      </div>

      {/* Recipients */}
      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>Recipients *</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input style={{ ...S.input, flex: 1 }} type="email"
            value={recipientIn} onChange={(e) => setRecipientIn(e.target.value)}
            placeholder="analyst@stlcc.edu"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
          />
          <button type="button" style={{ ...S.btn, ...S.ghostBtn, whiteSpace: "nowrap" }}
            onClick={addRecipient}>Add</button>
        </div>
        {recipients.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {recipients.map((r) => (
              <span key={r} style={{
                background: "#deeeff", color: "#003a70", borderRadius: 12,
                padding: "3px 10px", fontSize: "0.76rem", display: "flex", alignItems: "center", gap: 5
              }}>
                {r}
                <button type="button" onClick={() => removeRecipient(r)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#003a70", fontSize: "0.85rem", lineHeight: 1, padding: 0 }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" style={{ ...S.btn, ...S.ghostBtn }} onClick={onCancel}>Cancel</button>
        <button type="submit" style={{ ...S.btn, ...S.primaryBtn }}
          disabled={saving || !name.trim() || !recipients.length}>
          {saving ? "Saving…" : initial ? "Save Changes" : "Create Schedule"}
        </button>
      </div>
    </form>
  );
}

// ── Schedule row ──────────────────────────────────────────────────────────────
function ScheduleRow({ schedule, isAdmin, onToggle, onEdit, onDelete, onRunNow, running }) {
  const recipients = Array.isArray(schedule.recipients) ? schedule.recipients : [];

  return (
    <div style={{ ...S.card, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: "#222", fontSize: "0.92rem" }}>{schedule.name}</span>
            <span style={S.badge(schedule.is_active)}>
              {schedule.is_active ? "Active" : "Paused"}
            </span>
            {schedule.last_status && (
              <span style={S.statusBadge(schedule.last_status)}>{schedule.last_status}</span>
            )}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#666", display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
            <span>Type: <strong>{typeLabel(schedule.report_type)}</strong></span>
            <span>Frequency: <strong>{freqLabel(schedule.frequency)}</strong></span>
            <span>Recipients: <strong>{recipients.length}</strong></span>
            {schedule.last_run_at && (
              <span>Last run: <strong>{fmtDate(schedule.last_run_at)}</strong></span>
            )}
            {schedule.next_run_at && schedule.is_active && (
              <span>Next run: <strong>{fmtDate(schedule.next_run_at)}</strong></span>
            )}
          </div>
          {schedule.last_error && (
            <div style={{
              marginTop: 6, fontSize: "0.74rem", color: "#e74c3c",
              background: "#fff0f0", borderRadius: 4, padding: "4px 8px"
            }}>
              Last error: {schedule.last_error}
            </div>
          )}
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 5 }}>
            {recipients.map((r) => (
              <span key={r} style={{
                background: "#f0f3f7", color: "#555", borderRadius: 10,
                padding: "1px 8px", fontSize: "0.7rem"
              }}>{r}</span>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
            <button style={{ ...S.btn, ...S.ghostBtn }}
              onClick={() => onRunNow(schedule.id)} disabled={running === schedule.id}>
              {running === schedule.id ? "Sending…" : "Run Now"}
            </button>
            <button style={{ ...S.btn, ...S.ghostBtn }} onClick={() => onEdit(schedule)}>Edit</button>
            <button style={{ ...S.btn, background: schedule.is_active ? "#fff8e6" : "#e8f8f0",
              border: `1px solid ${schedule.is_active ? "#f39c12" : "#27ae60"}`,
              color: schedule.is_active ? "#f39c12" : "#27ae60" }}
              onClick={() => onToggle(schedule)}>
              {schedule.is_active ? "Pause" : "Resume"}
            </button>
            <button style={{ ...S.btn, ...S.dangerBtn }} onClick={() => onDelete(schedule.id)}>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function ScheduledReportsPanel({ authToken, user }) {
  const isAdmin = user?.role === "Admin";

  const [schedules, setSchedules] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState(null);   // schedule being edited
  const [saving,    setSaving]    = useState(false);
  const [running,   setRunning]   = useState(null);   // id being run-now'd
  const [toast,     setToast]     = useState(null);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { schedules: list } = await listScheduledReports(authToken);
      setSchedules(list || []);
    } catch (e) {
      setError(e.message || "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [authToken]);

  async function handleSave(payload) {
    setSaving(true);
    try {
      if (editing) {
        const { schedule } = await updateScheduledReport(authToken, editing.id, payload);
        setSchedules((prev) => prev.map((s) => s.id === schedule.id ? schedule : s));
        showToast("Schedule updated.");
      } else {
        const { schedule } = await createScheduledReport(authToken, payload);
        setSchedules((prev) => [schedule, ...prev]);
        showToast("Schedule created.");
      }
      setShowForm(false);
      setEditing(null);
    } catch (e) {
      showToast(e.message || "Save failed", false);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(schedule) {
    try {
      const { schedule: updated } = await updateScheduledReport(authToken, schedule.id, {
        isActive: !schedule.is_active
      });
      setSchedules((prev) => prev.map((s) => s.id === updated.id ? updated : s));
      showToast(updated.is_active ? "Schedule resumed." : "Schedule paused.");
    } catch (e) {
      showToast(e.message || "Update failed", false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this schedule? This cannot be undone.")) return;
    try {
      await deleteScheduledReport(authToken, id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      showToast("Schedule deleted.");
    } catch (e) {
      showToast(e.message || "Delete failed", false);
    }
  }

  async function handleRunNow(id) {
    setRunning(id);
    try {
      await runScheduledReportNow(authToken, id);
      showToast("Report sent to recipients.");
      load(); // refresh last_run_at
    } catch (e) {
      showToast(e.message || "Run failed", false);
    } finally {
      setRunning(null);
    }
  }

  return (
    <article className="panel active">
      <header className="panel-head">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2>Scheduled Reports</h2>
            <p>Automatically email budget report digests to stakeholders on a defined schedule.</p>
          </div>
          {isAdmin && !showForm && (
            <button
              style={{ ...S.btn, ...S.primaryBtn, flexShrink: 0 }}
              onClick={() => { setEditing(null); setShowForm(true); }}
            >
              + New Schedule
            </button>
          )}
        </div>
      </header>

      <div style={{ padding: "0 24px 32px" }}>

        {/* Toast */}
        {toast && (
          <div style={{
            marginBottom: 14, padding: "10px 16px", borderRadius: 6,
            background: toast.ok ? "#e8f8f0" : "#fff0f0",
            border: `1px solid ${toast.ok ? "#a3d9b1" : "#f5c6cb"}`,
            color: toast.ok ? "#1e7e34" : "#c0392b",
            fontSize: "0.83rem"
          }}>
            {toast.msg}
          </div>
        )}

        {/* Create / edit form */}
        {showForm && (
          <div style={{ ...S.card, marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 16px", color: "#003a70", fontSize: "0.92rem" }}>
              {editing ? "Edit Schedule" : "New Scheduled Report"}
            </h3>
            <ScheduleForm
              initial={editing}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditing(null); }}
              saving={saving}
            />
          </div>
        )}

        {loading && <p style={{ color: "#888", fontSize: "0.83rem" }}>Loading schedules…</p>}
        {error   && (
          <div style={{
            background: "#fff0f0", border: "1px solid #f5c6cb", borderRadius: 6,
            padding: "12px 16px", color: "#c0392b", fontSize: "0.85rem"
          }}>
            {error}
          </div>
        )}

        {!loading && !error && schedules.length === 0 && (
          <div style={{
            textAlign: "center", padding: "48px 0", color: "#888"
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📅</div>
            <p style={{ margin: 0, fontSize: "0.9rem" }}>No scheduled reports configured yet.</p>
            {isAdmin && (
              <p style={{ margin: "6px 0 0", fontSize: "0.8rem" }}>
                Click <strong>+ New Schedule</strong> above to set up automated report delivery.
              </p>
            )}
          </div>
        )}

        {!loading && schedules.map((s) => (
          <ScheduleRow
            key={s.id}
            schedule={s}
            isAdmin={isAdmin}
            onToggle={handleToggle}
            onEdit={(sch) => { setEditing(sch); setShowForm(true); }}
            onDelete={handleDelete}
            onRunNow={handleRunNow}
            running={running}
          />
        ))}

        {/* Info box */}
        {!loading && (
          <div style={{
            marginTop: 24, background: "#f8f9fb", border: "1px solid #e0e4ea",
            borderRadius: 8, padding: "14px 18px", fontSize: "0.78rem", color: "#666"
          }}>
            <strong style={{ color: "#003a70" }}>How it works:</strong>{" "}
            Reports are generated automatically at the configured time and emailed to all recipients.
            Use <strong>Run Now</strong> to test delivery immediately.
            CRON jobs run in Central Time (America/Chicago). Budget Summary and Forecast reports
            use data from all fiscal years unless a Fiscal Year filter is set.
          </div>
        )}
      </div>
    </article>
  );
}
