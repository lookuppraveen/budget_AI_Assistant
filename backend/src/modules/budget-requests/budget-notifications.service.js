/**
 * Budget request lifecycle email notifications.
 * All sends are fire-and-forget — callers should .catch() so nothing blocks.
 */
import { sendMail } from "../../utils/mailer.js";
import { pool }     from "../../config/db.js";
import { env }      from "../../config/env.js";

const BASE_URL = (env.frontendUrl || "").replace(/\/$/, "");

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusLabel(status) {
  return {
    approved:     "Approved",
    denied:       "Denied",
    on_hold:      "Placed On Hold",
    under_review: "Under Review",
    submitted:    "Submitted for Review"
  }[status] || status;
}

function statusColor(status) {
  return {
    approved:     "#27ae60",
    denied:       "#e74c3c",
    on_hold:      "#f39c12",
    under_review: "#2980b9",
    submitted:    "#8e44ad"
  }[status] || "#555";
}

function baseTemplate(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f4f6f8;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.10);">
        <tr>
          <td style="background:#003a70;padding:20px 32px;">
            <h1 style="color:#fff;margin:0;font-size:20px;font-weight:600;">STLCC Budget Assistant</h1>
            <p style="color:#aac4e0;margin:4px 0 0;font-size:13px;">Budget Management System</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${body}
            <hr style="border:none;border-top:1px solid #eee;margin:28px 0 16px;">
            <p style="color:#aaa;font-size:11px;margin:0;">
              Automated notification — STLCC Budget Management System. Do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function infoTable(rows) {
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    ${rows.map((r, i) => `
      <tr style="${i % 2 === 0 ? "background:#f8f9fb;" : ""}">
        <td style="padding:9px 14px;font-weight:600;color:#444;width:42%;">${r[0]}</td>
        <td style="padding:9px 14px;color:#222;">${r[1]}</td>
      </tr>`).join("")}
  </table>`;
}

function ctaButton(label, url) {
  return `<p style="margin:24px 0 0;">
    <a href="${url}"
       style="display:inline-block;background:#003a70;color:#fff;padding:11px 22px;
              border-radius:5px;text-decoration:none;font-size:14px;font-weight:500;">
      ${label} →
    </a>
  </p>`;
}

async function logNotification(requestId, type, email, success, errorMsg = null) {
  await pool.query(
    `INSERT INTO budget_notification_log
       (request_id, notification_type, recipient_email, success, error_message)
     VALUES ($1, $2, $3, $4, $5)`,
    [requestId, type, email, success, errorMsg]
  ).catch(() => {}); // log failures are never fatal
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Notify all Admin + Budget Analyst users when a request is submitted.
 */
export async function notifyRequestSubmitted(requestId) {
  const res = await pool.query(
    `SELECT br.title, br.fiscal_year, br.requested_amount,
            d.name  AS department_name,
            u.email AS submitter_email,
            u.name AS submitter_name
     FROM budget_requests br
     JOIN departments d ON d.id = br.department_id
     JOIN users       u ON u.id = br.submitted_by
     WHERE br.id = $1`,
    [requestId]
  );
  if (!res.rowCount) return;
  const req = res.rows[0];

  const reviewersRes = await pool.query(
    `SELECT u.email
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name IN ('Admin', 'Budget Analyst') AND u.is_active = true`
  );
  if (!reviewersRes.rowCount) return;

  const subject = `[Budget Request] New Submission: ${req.title}`;
  const html = baseTemplate(`
    <h2 style="color:#003a70;margin-top:0;">New Budget Request Submitted</h2>
    <p style="color:#444;">A budget request has been submitted and is awaiting your review.</p>
    ${infoTable([
      ["Title",            req.title],
      ["Department",       req.department_name],
      ["Fiscal Year",      req.fiscal_year],
      ["Requested Amount", `<strong>$${Number(req.requested_amount).toLocaleString()}</strong>`],
      ["Submitted By",     req.submitter_name]
    ])}
    ${ctaButton("Review Request", BASE_URL)}
  `);

  for (const reviewer of reviewersRes.rows) {
    try {
      await sendMail({ to: reviewer.email, subject, html });
      await logNotification(requestId, "submitted", reviewer.email, true);
    } catch (err) {
      await logNotification(requestId, "submitted", reviewer.email, false, err.message);
    }
  }
}

/**
 * Notify the submitter when a reviewer changes the request status.
 */
export async function notifyRequestReviewed(requestId, newStatus) {
  const res = await pool.query(
    `SELECT br.title, br.fiscal_year, br.requested_amount,
            br.reviewer_notes, br.decision_rationale,
            d.name  AS department_name,
            s.email AS submitter_email,
            s.name AS submitter_name,
            rv.name AS reviewer_name
     FROM budget_requests br
     JOIN departments d  ON d.id  = br.department_id
     JOIN users       s  ON s.id  = br.submitted_by
     LEFT JOIN users  rv ON rv.id = br.reviewed_by
     WHERE br.id = $1`,
    [requestId]
  );
  if (!res.rowCount) return;
  const req = res.rows[0];

  const color = statusColor(newStatus);
  const label = statusLabel(newStatus);
  const subject = `[Budget Request] Status Update: ${label} — ${req.title}`;

  const notesRow = (req.reviewer_notes || req.decision_rationale)
    ? [["Reviewer Notes", req.reviewer_notes || req.decision_rationale]]
    : [];

  const html = baseTemplate(`
    <h2 style="color:#003a70;margin-top:0;">Budget Request Status Update</h2>
    <p style="color:#444;">Your budget request status has been updated to
       <strong style="color:${color};">${label}</strong>.</p>
    ${infoTable([
      ["Title",            req.title],
      ["Status",           `<span style="color:${color};font-weight:600;">${label}</span>`],
      ["Department",       req.department_name],
      ["Fiscal Year",      req.fiscal_year],
      ["Requested Amount", `$${Number(req.requested_amount).toLocaleString()}`],
      ["Reviewed By",      req.reviewer_name || "Budget Team"],
      ...notesRow
    ])}
    ${ctaButton("View Request", BASE_URL)}
  `);

  try {
    await sendMail({ to: req.submitter_email, subject, html });
    await logNotification(requestId, newStatus, req.submitter_email, true);
  } catch (err) {
    await logNotification(requestId, newStatus, req.submitter_email, false, err.message);
  }
}

/**
 * Returns recent notification history for a given request.
 */
export async function getNotificationLog(requestId) {
  const res = await pool.query(
    `SELECT notification_type, recipient_email, success, error_message, sent_at
     FROM budget_notification_log
     WHERE request_id = $1
     ORDER BY sent_at DESC
     LIMIT 50`,
    [requestId]
  );
  return res.rows;
}
