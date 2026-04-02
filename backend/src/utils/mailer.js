/**
 * Shared mailer utility.
 * Reads the active email integration from DB and sends outbound email using:
 *  - Gmail / generic SMTP → nodemailer SMTP transport
 *  - Microsoft 365      → Microsoft Graph API /sendMail
 */
import nodemailer from "nodemailer";
import { pool } from "../config/db.js";

// ── helpers ──────────────────────────────────────────────────────────────────

async function getActiveConfig() {
  const result = await pool.query(
    `SELECT provider, config FROM email_integrations
     WHERE status = 'connected'
     ORDER BY updated_at DESC LIMIT 1`
  );
  if (!result.rowCount) return null;
  return result.rows[0];
}

async function getM365Token(config) {
  const { tenantId, clientId, clientSecret } = config;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default"
  });
  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }
  );
  if (!resp.ok) throw new Error("M365 token request failed");
  const data = await resp.json();
  return data.access_token;
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Send an email using the stored integration config.
 * @param {{ to: string, subject: string, html: string, text?: string }} opts
 * @returns {Promise<void>}
 * @throws if no connected email config exists or sending fails
 */
export async function sendMail({ to, subject, html, text }) {
  const row = await getActiveConfig();

  if (!row) {
    throw Object.assign(
      new Error("No connected email integration. Configure one in Settings → Email."),
      { statusCode: 503 }
    );
  }

  const { provider, config } = row;

  if (provider === "m365") {
    // Microsoft Graph /sendMail (app-only, requires Mail.Send permission)
    const token = await getM365Token(config);
    const payload = {
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }]
      },
      saveToSentItems: false
    };
    const sendResp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${config.mailbox}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );
    if (!sendResp.ok) {
      const err = await sendResp.json().catch(() => ({}));
      throw new Error(`M365 sendMail failed: ${err?.error?.message || sendResp.statusText}`);
    }
    return;
  }

  // Gmail or generic SMTP — use nodemailer
  let transportConfig;
  if (provider === "gmail") {
    transportConfig = {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: config.mailbox, pass: config.appPassword }
    };
  } else {
    // generic smtp
    const port = Number(config.smtpPort) || 587;
    transportConfig = {
      host: config.smtpHost,
      port,
      secure: port === 465,
      auth: { user: config.username || config.mailbox, pass: config.password }
    };
  }

  const transporter = nodemailer.createTransport(transportConfig);
  try {
    await transporter.sendMail({
      from: config.mailbox,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, " ")
    });
  } finally {
    transporter.close();
  }
}
