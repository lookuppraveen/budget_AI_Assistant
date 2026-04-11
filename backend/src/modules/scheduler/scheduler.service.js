/**
 * Scheduled report automation.
 *  - Loads active schedules from DB on startup and registers cron jobs.
 *  - Generates HTML report digests and emails them to configured recipients.
 *  - CRUD functions for managing schedule configs via the API.
 */
import cron from "node-cron";
import { pool }     from "../../config/db.js";
import { sendMail } from "../../utils/mailer.js";

// frequency → cron expression
const CRON_MAP = {
  daily:   "0 7 * * *",      // 07:00 every day
  weekly:  "0 7 * * 1",      // 07:00 every Monday
  monthly: "0 7 1 * *"       // 07:00 on the 1st of each month
};

// In-memory registry of active cron tasks  (scheduleId → Task)
const activeJobs = new Map();

// ── Report generators ─────────────────────────────────────────────────────────

async function genBudgetSummary(filters) {
  const fy = filters?.fiscalYear;
  const res = await pool.query(
    `SELECT
       COUNT(*)::int                                                AS total,
       COUNT(CASE WHEN status='draft'        THEN 1 END)::int     AS draft,
       COUNT(CASE WHEN status='submitted'    THEN 1 END)::int     AS submitted,
       COUNT(CASE WHEN status='under_review' THEN 1 END)::int     AS under_review,
       COUNT(CASE WHEN status='approved'     THEN 1 END)::int     AS approved,
       COUNT(CASE WHEN status='denied'       THEN 1 END)::int     AS denied,
       COUNT(CASE WHEN status='on_hold'      THEN 1 END)::int     AS on_hold,
       COALESCE(SUM(requested_amount),0)::numeric                 AS total_requested,
       COALESCE(SUM(CASE WHEN status='approved' THEN requested_amount END),0)::numeric AS total_approved
     FROM budget_requests
     ${fy ? "WHERE fiscal_year = $1" : ""}`,
    fy ? [fy] : []
  );
  const s = res.rows[0];
  const approvalRate = s.total > 0
    ? Math.round(((s.approved) / s.total) * 100) : 0;

  return {
    title: `Budget Summary Report${fy ? ` — ${fy}` : ""}`,
    rows: [
      ["Total Requests",    s.total],
      ["Draft",             s.draft],
      ["Submitted",         s.submitted],
      ["Under Review",      s.under_review],
      ["Approved",          s.approved],
      ["Denied",            s.denied],
      ["On Hold",           s.on_hold],
      ["Total Requested",   `$${Number(s.total_requested).toLocaleString()}`],
      ["Total Approved",    `$${Number(s.total_approved).toLocaleString()}`],
      ["Approval Rate",     `${approvalRate}%`]
    ]
  };
}

async function genRequestPipeline(filters) {
  const fy = filters?.fiscalYear;
  const res = await pool.query(
    `SELECT br.title, br.fiscal_year, br.status, br.priority,
            br.requested_amount,
            d.name AS department,
            u.name AS submitter
     FROM budget_requests br
     JOIN departments d ON d.id = br.department_id
     JOIN users       u ON u.id = br.submitted_by
     WHERE br.status NOT IN ('draft','denied')
       ${fy ? "AND br.fiscal_year = $1" : ""}
     ORDER BY
       CASE br.status
         WHEN 'submitted'    THEN 1
         WHEN 'under_review' THEN 2
         WHEN 'on_hold'      THEN 3
         WHEN 'approved'     THEN 4
       END,
       br.requested_amount DESC
     LIMIT 50`,
    fy ? [fy] : []
  );

  return {
    title: `Request Pipeline Report${fy ? ` — ${fy}` : ""}`,
    rows:  res.rows.map((r) => [
      r.title.slice(0, 40),
      r.department,
      r.status.replace("_", " "),
      r.priority || "—",
      `$${Number(r.requested_amount).toLocaleString()}`,
      r.submitter
    ]),
    headers: ["Title", "Department", "Status", "Priority", "Amount", "Submitter"]
  };
}

async function genAnomalyReport(filters) {
  const fy = filters?.fiscalYear;
  const res = await pool.query(
    `SELECT af.flag_type, af.severity, af.description,
            br.title AS request_title, d.name AS department,
            af.created_at
     FROM budget_anomaly_flags af
     JOIN budget_requests br ON br.id = af.request_id
     JOIN departments     d  ON d.id  = br.department_id
     WHERE af.is_resolved = false
       ${fy ? "AND br.fiscal_year = $1" : ""}
     ORDER BY
       CASE af.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       af.created_at DESC
     LIMIT 50`,
    fy ? [fy] : []
  );

  return {
    title: `Anomaly Report${fy ? ` — ${fy}` : ""}`,
    rows:  res.rows.map((r) => [
      r.flag_type.replace(/_/g, " "),
      r.severity.toUpperCase(),
      r.request_title.slice(0, 40),
      r.department,
      r.description.slice(0, 60)
    ]),
    headers: ["Flag Type", "Severity", "Request", "Department", "Description"]
  };
}

async function genForecast(filters) {
  const res = await pool.query(
    `SELECT fiscal_year,
            COUNT(*)::int                                                              AS count,
            COALESCE(SUM(requested_amount),0)::numeric                               AS requested,
            COALESCE(SUM(CASE WHEN status='approved' THEN requested_amount END),0)::numeric AS approved
     FROM budget_requests
     GROUP BY fiscal_year
     ORDER BY fiscal_year`
  );

  return {
    title: "Multi-Year Budget Forecast",
    rows:  res.rows.map((r) => [
      r.fiscal_year,
      r.count,
      `$${Number(r.requested).toLocaleString()}`,
      `$${Number(r.approved).toLocaleString()}`,
      r.requested > 0 ? `${Math.round((r.approved / r.requested) * 100)}%` : "—"
    ]),
    headers: ["Fiscal Year", "Requests", "Total Requested", "Total Approved", "Approval Rate"]
  };
}

const GENERATORS = {
  budget_summary:   genBudgetSummary,
  request_pipeline: genRequestPipeline,
  anomaly_report:   genAnomalyReport,
  forecast:         genForecast
};

// ── Email template ────────────────────────────────────────────────────────────

function buildReportEmail(schedule, reportData, generatedAt) {
  const { title, rows, headers } = reportData;

  // Determine if this is a KV table or a data grid
  const isGrid  = Boolean(headers?.length);
  const dateStr = new Date(generatedAt).toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  const tableHtml = isGrid
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;">
         <thead>
           <tr style="background:#003a70;color:#fff;">
             ${headers.map((h) => `<th style="padding:8px 10px;text-align:left;">${h}</th>`).join("")}
           </tr>
         </thead>
         <tbody>
           ${rows.map((r, i) => `
             <tr style="${i % 2 === 0 ? "background:#f8f9fb;" : ""}">
               ${r.map((c) => `<td style="padding:7px 10px;border-bottom:1px solid #eee;">${c}</td>`).join("")}
             </tr>`).join("")}
         </tbody>
       </table>`
    : `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;">
         <tbody>
           ${rows.map(([k, v], i) => `
             <tr style="${i % 2 === 0 ? "background:#f8f9fb;" : ""}">
               <td style="padding:8px 12px;font-weight:600;color:#444;width:44%;">${k}</td>
               <td style="padding:8px 12px;">${v}</td>
             </tr>`).join("")}
         </tbody>
       </table>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f6f8;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.10);">
        <tr>
          <td style="background:#003a70;padding:18px 28px;">
            <h1 style="color:#fff;margin:0;font-size:18px;">STLCC Budget Assistant</h1>
            <p  style="color:#aac4e0;margin:2px 0 0;font-size:12px;">Scheduled Report</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h2 style="color:#003a70;margin:0 0 4px;">${title}</h2>
            <p  style="color:#888;font-size:12px;margin:0 0 20px;">
              Schedule: <strong>${schedule.name}</strong> · Generated: ${dateStr}
            </p>
            ${tableHtml}
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0 14px;">
            <p style="color:#aaa;font-size:11px;margin:0;">
              Automated scheduled report — STLCC Budget Management System.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject: `[Scheduled] ${title}`,
    html
  };
}

// ── Core job runner ───────────────────────────────────────────────────────────

async function runSchedule(scheduleId) {
  const res = await pool.query(
    `SELECT * FROM scheduled_reports WHERE id = $1 AND is_active = true`, [scheduleId]
  );
  if (!res.rowCount) return;
  const schedule = res.rows[0];
  const recipients = Array.isArray(schedule.recipients) ? schedule.recipients : [];
  if (!recipients.length) return;

  const generator = GENERATORS[schedule.report_type];
  if (!generator) return;

  const generatedAt = new Date().toISOString();
  let lastStatus = "success";
  let lastError  = null;

  try {
    const reportData = await generator(schedule.filters || {});
    const { subject, html } = buildReportEmail(schedule, reportData, generatedAt);

    for (const email of recipients) {
      await sendMail({ to: email, subject, html }).catch((err) => {
        console.error(`Scheduled report email failed to ${email}: ${err.message}`);
      });
    }
  } catch (err) {
    lastStatus = "failed";
    lastError  = err.message;
    console.error(`Scheduled report run failed (${scheduleId}): ${err.message}`);
  }

  // Update last_run_at + status
  await pool.query(
    `UPDATE scheduled_reports
     SET last_run_at = now(), last_status = $1, last_error = $2, updated_at = now()
     WHERE id = $3`,
    [lastStatus, lastError, scheduleId]
  ).catch(() => {});
}

// ── Scheduler lifecycle ───────────────────────────────────────────────────────

function registerJob(schedule) {
  const expr = CRON_MAP[schedule.frequency];
  if (!expr || !cron.validate(expr)) return;

  // Cancel any existing job first
  const existing = activeJobs.get(schedule.id);
  if (existing) { existing.stop(); activeJobs.delete(schedule.id); }

  const task = cron.schedule(expr, () => {
    runSchedule(schedule.id).catch((err) =>
      console.error(`Unhandled scheduler error for ${schedule.id}: ${err.message}`)
    );
  }, { timezone: "America/Chicago" });

  activeJobs.set(schedule.id, task);
}

export async function startScheduler() {
  const res = await pool.query(
    `SELECT * FROM scheduled_reports WHERE is_active = true`
  );
  for (const row of res.rows) {
    registerJob(row);
  }
  console.log(`Scheduler started — ${res.rowCount} active schedule(s) registered.`);
}

export function stopScheduler() {
  for (const [id, task] of activeJobs) {
    task.stop();
    activeJobs.delete(id);
  }
}

// ── CRUD API ──────────────────────────────────────────────────────────────────

export async function listScheduledReports() {
  const res = await pool.query(
    `SELECT sr.*, u.name AS created_by_name
     FROM scheduled_reports sr
     LEFT JOIN users u ON u.id = sr.created_by
     ORDER BY sr.created_at DESC`
  );
  return res.rows;
}

export async function createScheduledReport(payload, userId) {
  const { name, reportType, frequency, recipients, filters } = payload;
  const res = await pool.query(
    `INSERT INTO scheduled_reports
       (name, report_type, frequency, recipients, filters, created_by, next_run_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6,
       CASE $2::text
         WHEN 'daily'   THEN date_trunc('day',  now() + interval '1 day')  + interval '7 hours'
         WHEN 'weekly'  THEN date_trunc('week', now() + interval '1 week') + interval '7 hours'
         WHEN 'monthly' THEN date_trunc('month',now() + interval '1 month')+ interval '7 hours'
       END)
     RETURNING *`,
    [name, reportType, frequency, JSON.stringify(recipients), JSON.stringify(filters || {}), userId]
  );
  const row = res.rows[0];
  if (row.is_active) registerJob(row);
  return row;
}

export async function updateScheduledReport(id, payload) {
  const fields = [];
  const values = [];
  const allowed = {
    name: "name", reportType: "report_type", frequency: "frequency",
    recipients: "recipients", filters: "filters", isActive: "is_active"
  };

  for (const [jsKey, dbCol] of Object.entries(allowed)) {
    if (payload[jsKey] !== undefined) {
      const val = ["recipients","filters"].includes(dbCol) ? JSON.stringify(payload[jsKey]) : payload[jsKey];
      values.push(val);
      fields.push(`${dbCol} = $${values.length}${["recipients","filters"].includes(dbCol) ? "::jsonb" : ""}`);
    }
  }
  if (!fields.length) throw Object.assign(new Error("Nothing to update"), { statusCode: 400 });

  values.push(id);
  const res = await pool.query(
    `UPDATE scheduled_reports SET ${fields.join(", ")}, updated_at = now()
     WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!res.rowCount) throw Object.assign(new Error("Schedule not found"), { statusCode: 404 });

  const row = res.rows[0];
  // Re-register or stop job based on is_active flag
  if (row.is_active) {
    registerJob(row);
  } else {
    const task = activeJobs.get(id);
    if (task) { task.stop(); activeJobs.delete(id); }
  }
  return row;
}

export async function deleteScheduledReport(id) {
  const task = activeJobs.get(id);
  if (task) { task.stop(); activeJobs.delete(id); }
  await pool.query(`DELETE FROM scheduled_reports WHERE id = $1`, [id]);
  return { deleted: true };
}

export async function runScheduledReportNow(id) {
  await runSchedule(id);
  const res = await pool.query(`SELECT * FROM scheduled_reports WHERE id = $1`, [id]);
  return res.rows[0] || null;
}
