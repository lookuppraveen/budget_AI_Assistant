import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { pool } from "../../config/db.js";
import { extractText } from "../../utils/extract-text.js";

const SECRET_MASK = "••••••••";

// ── helpers ────────────────────────────────────────────────────────────────────

function maskConfig(config) {
  const masked = { ...config };
  if (masked.appPassword) masked.appPassword = SECRET_MASK;
  if (masked.clientSecret) masked.clientSecret = SECRET_MASK;
  if (masked.password) masked.password = SECRET_MASK;
  return masked;
}

/** Returns the first available department id (used as fallback for email attachments) */
async function getDefaultDepartmentId() {
  const r = await pool.query("SELECT id FROM departments ORDER BY id LIMIT 1");
  if (r.rowCount === 0) throw Object.assign(new Error("No departments configured"), { statusCode: 500 });
  return r.rows[0].id;
}

/** Returns the first user id in the system (acts as system submitter for email attachments) */
async function getSystemUserId() {
  const r = await pool.query("SELECT id FROM users ORDER BY created_at ASC LIMIT 1");
  if (r.rowCount === 0) throw Object.assign(new Error("No users in system"), { statusCode: 500 });
  return r.rows[0].id;
}

/**
 * Check if we already ingested this attachment (deduplication).
 * We store externalRef = "<messageId>_<attachmentName>" in metadata.
 */
async function isAlreadyIngested(externalRef) {
  const r = await pool.query(
    `SELECT id FROM knowledge_documents
     WHERE source_type = 'EmailAttachment'
       AND metadata->>'externalRef' = $1
     LIMIT 1`,
    [externalRef]
  );
  return r.rowCount > 0;
}

/**
 * Persist one extracted attachment as a knowledge_documents row.
 * Returns the new document id, or null if skipped (duplicate / empty text).
 */
async function saveAttachment({ title, rawText, externalRef, domain, departmentId, submittedBy }) {
  if (!rawText || rawText.trim().length < 20) return null; // skip near-empty extracts

  const dup = await isAlreadyIngested(externalRef);
  if (dup) return null;

  const result = await pool.query(
    `INSERT INTO knowledge_documents
       (title, source_type, domain, department_id, submitted_by, metadata, raw_text, status)
     VALUES ($1, 'EmailAttachment', $2, $3, $4, $5::jsonb, $6, 'Pending')
     RETURNING id`,
    [
      title.slice(0, 300),
      domain,
      departmentId,
      submittedBy,
      JSON.stringify({ externalRef }),
      rawText.trim()
    ]
  );
  return result.rows[0].id;
}

/** Insert a row into email_sync_events for trend analytics */
async function recordSyncEvent(provider, emailsCount, attachmentsIngested) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  await pool.query(
    `INSERT INTO email_sync_events (provider, emails_count, attachments_ingested, month_start)
     VALUES ($1, $2, $3, $4)`,
    [provider, emailsCount, attachmentsIngested, monthStart.toISOString().slice(0, 10)]
  );
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export async function getEmailConfig() {
  const result = await pool.query(
    `SELECT id, provider, config, status, last_synced_at, synced_emails, synced_attachments
     FROM email_integrations
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return { ...row, config: maskConfig(row.config) };
}

async function upsertEmailRow(provider, config, status) {
  const existing = await pool.query("SELECT id FROM email_integrations LIMIT 1");
  if (existing.rowCount) {
    await pool.query(
      `UPDATE email_integrations
       SET provider = $1, config = $2::jsonb, status = $3, updated_at = now()
       WHERE id = $4`,
      [provider, JSON.stringify(config), status, existing.rows[0].id]
    );
    return;
  }
  await pool.query(
    `INSERT INTO email_integrations (provider, config, status) VALUES ($1, $2::jsonb, $3)`,
    [provider, JSON.stringify(config), status]
  );
}

// ── Connection tests ───────────────────────────────────────────────────────────

async function testGmailConnection(config) {
  const { mailbox, appPassword } = config;
  if (!mailbox || !appPassword) {
    return { connected: false, message: "Gmail mailbox and App Password are required." };
  }
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 587, secure: false,
    auth: { user: mailbox, pass: appPassword }
  });
  try {
    await transporter.verify();
    return { connected: true, message: `Connected to Gmail (${mailbox}) successfully.` };
  } catch (error) {
    return { connected: false, message: `Gmail connection failed: ${error.message}` };
  } finally {
    transporter.close();
  }
}

async function testM365Connection(config) {
  const { tenantId, clientId, clientSecret, mailbox } = config;
  if (!tenantId || !clientId || !clientSecret || !mailbox) {
    return { connected: false, message: "Tenant ID, Client ID, Client Secret, and Mailbox are required." };
  }

  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default"
  });

  try {
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tokenBody }
    );
    if (!tokenResponse.ok) {
      const err = await tokenResponse.json().catch(() => ({}));
      return { connected: false, message: `M365 auth failed: ${err.error_description || err.error || "unknown error"}` };
    }
    const { access_token } = await tokenResponse.json();
    const userResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${mailbox}`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    if (!userResponse.ok) {
      return { connected: false, message: `Token acquired but cannot access mailbox ${mailbox}. Verify User.Read.All permission.` };
    }
    return { connected: true, message: `Connected to Microsoft 365 (${mailbox}) successfully.` };
  } catch (error) {
    return { connected: false, message: `M365 connection failed: ${error.message}` };
  }
}

async function testSmtpConnection(config) {
  const { smtpHost, smtpPort, mailbox, username, password } = config;
  if (!smtpHost || !password) {
    return { connected: false, message: "SMTP host and password are required." };
  }
  const port = Number(smtpPort) || 587;
  const transporter = nodemailer.createTransport({
    host: smtpHost, port, secure: port === 465,
    auth: { user: username || mailbox, pass: password }
  });
  try {
    await transporter.verify();
    return { connected: true, message: `Connected to SMTP server (${smtpHost}:${port}) successfully.` };
  } catch (error) {
    return { connected: false, message: `SMTP connection failed: ${error.message}` };
  } finally {
    transporter.close();
  }
}

export async function testAndSaveEmailConfig(provider, config) {
  let result;
  if (provider === "gmail") result = await testGmailConnection(config);
  else if (provider === "m365") result = await testM365Connection(config);
  else if (provider === "smtp") result = await testSmtpConnection(config);
  else throw Object.assign(new Error("Unknown email provider"), { statusCode: 400 });

  await upsertEmailRow(provider, config, result.connected ? "connected" : "disconnected");
  return result;
}

// ── M365 attachment sync ───────────────────────────────────────────────────────

async function getM365AccessToken(config) {
  const { tenantId, clientId, clientSecret } = config;
  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default"
  });
  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tokenBody }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(`M365 auth failed: ${err.error_description || "unknown"}`), { statusCode: 502 });
  }
  const data = await resp.json();
  return data.access_token;
}

/** Map UI type labels to MIME type strings */
const TYPE_MIME_MAP = {
  PDF:  ["application/pdf"],
  DOCX: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"],
  XLSX: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"],
  PPTX: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.ms-powerpoint"],
  CSV:  ["text/csv"],
  TXT:  ["text/plain"]
};

function buildAllowedMimes(allowedTypes) {
  const all = Object.values(TYPE_MIME_MAP).flat();
  if (!allowedTypes || allowedTypes.length === 0) return new Set(all);
  const mimes = new Set();
  for (const t of allowedTypes) {
    for (const mime of (TYPE_MIME_MAP[t.toUpperCase()] || [])) mimes.add(mime);
  }
  return mimes;
}

async function syncM365Emails(config, allowedTypes, callerDepartmentId, callerUserId) {
  const { mailbox } = config;
  const accessToken = await getM365AccessToken(config);
  const [fallbackDeptId, fallbackUserId] = await Promise.all([
    callerDepartmentId ? Promise.resolve(callerDepartmentId) : getDefaultDepartmentId(),
    callerUserId ? Promise.resolve(callerUserId) : getSystemUserId()
  ]);
  const departmentId = fallbackDeptId;
  const submittedBy = fallbackUserId;
  const allowedMimes = buildAllowedMimes(allowedTypes);

  // Fetch recent messages — do NOT use $filter+$orderby together (breaks app-only auth on many tenants).
  // Include hasAttachments in $select and filter client-side instead.
  const msgsResp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/inbox/messages` +
    `?$top=50&$select=id,subject,receivedDateTime,hasAttachments`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!msgsResp.ok) {
    const errBody = await msgsResp.json().catch(() => ({}));
    const detail = errBody?.error?.message || msgsResp.statusText;
    throw Object.assign(
      new Error(`Failed to fetch messages from Graph API: ${detail}`),
      { statusCode: 502 }
    );
  }

  const msgsData = await msgsResp.json();
  // Filter client-side for messages that have attachments
  const allMessages = msgsData.value || [];
  const messages = allMessages.filter((m) => m.hasAttachments === true);
  const emailsCount = allMessages.length;
  let attachmentsIngested = 0;

  for (const msg of messages) {
    try {
      // Fetch non-inline file attachments (no $filter on attachments — also problematic)
      const attsResp = await fetch(
        `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${msg.id}/attachments` +
        `?$select=id,name,contentType,contentBytes,isInline,size`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!attsResp.ok) continue;

      const attsData = await attsResp.json();
      const attachments = (attsData.value || []).filter((a) => !a.isInline);

      for (const att of attachments) {
        try {
          if (!att.contentBytes) continue;

          const mimeType = (att.contentType || "").split(";")[0].trim().toLowerCase();
          // Skip if not in allowed types
          if (!allowedMimes.has(mimeType)) continue;

          const buffer = Buffer.from(att.contentBytes, "base64");
          const rawText = await extractText(buffer, mimeType);
          const subject = msg.subject || "Email Attachment";
          const externalRef = `m365_${msg.id}_${att.name}`;

          const docId = await saveAttachment({
            title: `${subject} — ${att.name}`,
            rawText,
            externalRef,
            domain: "EmailIngestion",
            departmentId,
            submittedBy
          });
          if (docId) attachmentsIngested++;
        } catch {
          // non-fatal: skip this attachment
        }
      }
    } catch {
      // non-fatal: skip this message
    }
  }

  return { synced: emailsCount, attachments: attachmentsIngested };
}

// ── IMAP attachment sync (Gmail + generic SMTP) ────────────────────────────────

async function syncImapEmails(imapConfig, provider, allowedTypes, callerDepartmentId, callerUserId) {
  const { host, port, secure, auth } = imapConfig;
  const [departmentId, submittedBy] = await Promise.all([
    callerDepartmentId ? Promise.resolve(callerDepartmentId) : getDefaultDepartmentId(),
    callerUserId ? Promise.resolve(callerUserId) : getSystemUserId()
  ]);
  const allowedMimes = buildAllowedMimes(allowedTypes);

  const client = new ImapFlow({
    host,
    port: port || (secure ? 993 : 143),
    secure: secure !== false,
    auth,
    logger: false
  });

  await client.connect();

  let emailsCount = 0;
  let attachmentsIngested = 0;

  try {
    const lock = await client.getMailboxLock("INBOX");

    try {
      const status = await client.status("INBOX", { messages: true });
      const total = status.messages || 0;
      // Fetch last 50 messages (most recent)
      const rangeStart = Math.max(1, total - 49);
      const range = `${rangeStart}:*`;

      for await (const msg of client.fetch(range, { envelope: true, bodyStructure: true })) {
        emailsCount++;
        const subject = msg.envelope?.subject || "Email Attachment";
        const messageId = msg.envelope?.messageId || String(msg.seq);

        // Walk the bodyStructure tree to find attachment parts
        const attachmentParts = collectAttachmentParts(msg.bodyStructure);

        for (const part of attachmentParts) {
          try {
            const { content } = await client.download(String(msg.seq), part.part, { uid: false });
            const chunks = [];
            for await (const chunk of content) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);

            const mimeType = (part.type + "/" + part.subtype).toLowerCase();

            // Skip if not in the user-selected allowed types
            if (!allowedMimes.has(mimeType)) continue;

            const fileName = part.dispositionParameters?.filename
              || part.parameters?.name
              || `attachment.${part.subtype}`;

            const rawText = await extractText(buffer, mimeType);
            const externalRef = `${provider}_${messageId}_${fileName}`;

            const docId = await saveAttachment({
              title: `${subject} — ${fileName}`,
              rawText,
              externalRef,
              domain: "EmailIngestion",
              departmentId,
              submittedBy
            });
            if (docId) attachmentsIngested++;
          } catch {
            // non-fatal: skip this part
          }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return { synced: emailsCount, attachments: attachmentsIngested };
}

/**
 * Recursively collect all non-inline attachment parts from a bodyStructure tree.
 * Returns array of part objects with their part identifier.
 */
function collectAttachmentParts(node, partPrefix = "") {
  const parts = [];

  if (!node) return parts;

  const disposition = node.disposition?.toLowerCase();
  const isAttachment = disposition === "attachment" || (node.name && disposition !== "inline");

  if (isAttachment && node.type && node.subtype) {
    parts.push({ ...node, part: partPrefix || "1" });
  }

  if (node.childNodes) {
    node.childNodes.forEach((child, index) => {
      const childPart = partPrefix ? `${partPrefix}.${index + 1}` : String(index + 1);
      parts.push(...collectAttachmentParts(child, childPart));
    });
  }

  return parts;
}

// ── Main sync dispatcher ───────────────────────────────────────────────────────

export async function syncEmails(allowedTypes, callerDepartmentId = null, callerUserId = null) {
  const existing = await pool.query(
    "SELECT provider, config, status FROM email_integrations ORDER BY updated_at DESC LIMIT 1"
  );

  if (!existing.rowCount || existing.rows[0].status !== "connected") {
    throw Object.assign(
      new Error("No connected email integration found. Test and save your configuration first."),
      { statusCode: 400 }
    );
  }

  const { provider, config } = existing.rows[0];
  let stats = { synced: 0, attachments: 0 };

  if (provider === "m365") {
    stats = await syncM365Emails(config, allowedTypes, callerDepartmentId, callerUserId);
  } else if (provider === "gmail") {
    stats = await syncImapEmails(
      {
        host: "imap.gmail.com",
        port: 993,
        secure: true,
        auth: { user: config.mailbox, pass: config.appPassword }
      },
      "gmail",
      allowedTypes,
      callerDepartmentId,
      callerUserId
    );
  } else if (provider === "smtp") {
    // Generic IMAP: use same host credentials, assume IMAPS on 993 or IMAP on 143
    const imapHost = config.imapHost || config.smtpHost;
    const imapPort = Number(config.imapPort) || 993;
    stats = await syncImapEmails(
      {
        host: imapHost,
        port: imapPort,
        secure: imapPort === 993,
        auth: { user: config.username || config.mailbox, pass: config.password }
      },
      "smtp",
      allowedTypes,
      callerDepartmentId,
      callerUserId
    );
  }

  // Persist updated counters
  await pool.query(
    `UPDATE email_integrations
     SET synced_emails = synced_emails + $1,
         synced_attachments = synced_attachments + $2,
         last_synced_at = now(),
         updated_at = now()
     WHERE id = (SELECT id FROM email_integrations LIMIT 1)`,
    [stats.synced, stats.attachments]
  );

  // Record for trend analytics
  await recordSyncEvent(provider, stats.synced, stats.attachments);

  return stats;
}
