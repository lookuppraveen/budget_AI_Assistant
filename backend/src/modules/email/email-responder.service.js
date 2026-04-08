/**
 * Email Responder Service
 *
 * Polls the configured mailbox for new inbound emails, treats each email body
 * as a query to the Budget Agent, and sends the AI-generated response back to
 * the original sender.
 *
 * Supported providers: M365 (Microsoft Graph API), Gmail (IMAP), SMTP/IMAP
 *
 * Flow per poll cycle:
 *   1. Fetch the 50 most-recent inbox messages
 *   2. Skip messages already recorded in email_inbox_queries (deduplication)
 *   3. Skip auto-replies / bounces / out-of-office messages
 *   4. Insert a 'pending' row into email_inbox_queries
 *   5. Call the same AI pipeline used by the chat interface
 *   6. Send the reply email to the original sender
 *   7. Update the row to 'replied' (or 'failed')
 */

import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { pool } from "../../config/db.js";
import { env } from "../../config/env.js";
import { searchKnowledgeChunks, indexAllApprovedDocuments } from "../retrieval/retrieval.service.js";
import OpenAI from "openai";

// ── OpenAI client (shared singleton) ──────────────────────────────────────────

let openAiClient = null;
function getOpenAiClient() {
  if (!openAiClient) openAiClient = new OpenAI({ apiKey: env.openAiApiKey });
  return openAiClient;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Patterns that identify auto-replies / bounces — we never reply to these. */
const AUTO_REPLY_PATTERNS = [
  /auto.?reply/i,
  /out.?of.?office/i,
  /automatic.?reply/i,
  /delivery.?status.?notification/i,
  /mailer.?daemon/i,
  /no.?reply/i,
  /noreply/i,
  /postmaster/i,
  /bounce/i
];

function isAutoReply(subject = "", fromAddress = "") {
  const combined = `${subject} ${fromAddress}`.toLowerCase();
  return AUTO_REPLY_PATTERNS.some((re) => re.test(combined));
}

/**
 * Strip quoted / forwarded text from an email body so we only feed the
 * user's own question to the AI.
 */
function extractUserQuery(bodyText = "") {
  if (!bodyText) return "";

  // Remove common quoting markers
  const lines = bodyText.split("\n");
  const cleaned = [];
  for (const line of lines) {
    const stripped = line.trim();
    // Stop at the first quoted-reply separator
    if (
      stripped.startsWith(">") ||
      /^On .+ wrote:/.test(stripped) ||
      /^From:.+/i.test(stripped) && cleaned.length > 0 ||
      stripped === "________________________________" ||
      stripped.startsWith("-----Original Message-----")
    ) {
      break;
    }
    cleaned.push(line);
  }

  return cleaned.join("\n").trim().slice(0, 4000); // cap at 4 000 chars
}

/** Check whether this external_message_id has already been processed. */
async function isAlreadyProcessed(externalMessageId) {
  const r = await pool.query(
    "SELECT 1 FROM email_inbox_queries WHERE external_message_id = $1 LIMIT 1",
    [externalMessageId]
  );
  return r.rowCount > 0;
}

/** Insert a pending record before processing so we claim it atomically. */
async function insertPending({ externalMessageId, senderEmail, senderName, subject, queryText, receivedAt }) {
  await pool.query(
    `INSERT INTO email_inbox_queries
       (external_message_id, sender_email, sender_name, subject, query_text, status, received_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     ON CONFLICT (external_message_id) DO NOTHING`,
    [externalMessageId, senderEmail, senderName || null, subject || null, queryText, receivedAt || null]
  );
}

/** Mark a row as replied. */
async function markReplied(externalMessageId, responseText) {
  await pool.query(
    `UPDATE email_inbox_queries
     SET status = 'replied', response_text = $2, replied_at = now(), updated_at = now()
     WHERE external_message_id = $1`,
    [externalMessageId, responseText]
  );
}

/** Mark a row as failed. */
async function markFailed(externalMessageId, errorMessage) {
  await pool.query(
    `UPDATE email_inbox_queries
     SET status = 'failed', error_message = $2, updated_at = now()
     WHERE external_message_id = $1`,
    [externalMessageId, String(errorMessage).slice(0, 1000)]
  );
}

/** Mark a row as skipped (auto-reply etc.). */
async function markSkipped(externalMessageId) {
  await pool.query(
    `UPDATE email_inbox_queries
     SET status = 'skipped', updated_at = now()
     WHERE external_message_id = $1`,
    [externalMessageId]
  );
}

// ── AI pipeline ────────────────────────────────────────────────────────────────

/**
 * Run the same knowledge-search + LLM pipeline as the chat interface.
 * Returns the plain-text response string.
 */
async function generateEmailResponse(queryText) {
  // 1. Search approved knowledge chunks
  let semanticMatches = await searchKnowledgeChunks(queryText, 15, null);
  if (!semanticMatches.length) {
    await indexAllApprovedDocuments();
    semanticMatches = await searchKnowledgeChunks(queryText, 15, null);
  }

  // 2. Build citation map and chunk list (mirrors chat.service.js)
  const citationMap = new Map();
  const chunks = [];
  for (const match of semanticMatches) {
    chunks.push({ content: match.content, title: match.title, domain: match.domain, score: Number(match.score.toFixed(4)) });
    const key = match.document_id;
    if (!citationMap.has(key) && citationMap.size < 5) {
      citationMap.set(key, { id: match.document_id, title: match.title, domain: match.domain, source_type: match.source_type, excerpt: match.content.slice(0, 220), score: Number(match.score.toFixed(4)) });
    }
  }
  const citations = Array.from(citationMap.values());

  // 3. Build system prompt
  const grouped = new Map();
  for (const chunk of chunks) {
    if (!grouped.has(chunk.title)) grouped.set(chunk.title, []);
    grouped.get(chunk.title).push(chunk);
  }

  let sourceIndex = 0;
  const knowledgeContext = chunks.length
    ? Array.from(grouped.entries())
        .map(([title, docChunks]) =>
          docChunks.map((c) => {
            sourceIndex++;
            const scorePct = typeof c.score === "number" ? ` — relevance: ${(c.score * 100).toFixed(0)}%` : "";
            return `[Source ${sourceIndex}: "${title}" (${c.domain})${scorePct}]\n${c.content}`;
          }).join("\n\n")
        )
        .join("\n\n---\n\n")
    : "No approved knowledge found for this query.";

  const systemPrompt = `You are a warm, knowledgeable Budget Assistant at St. Louis Community College. A user has emailed you a budget-related question and you are composing a helpful email reply.

PERSONALITY:
- Write naturally and conversationally, like a trusted colleague who knows budget policies inside out.
- Use contractions (you'll, I'd, that's, here's) to sound human.
- Keep your tone warm and supportive. Avoid stiff corporate language.
- Answer the question first, then give context.
- Give thorough, detailed answers. Think of each answer as a mini briefing for the person asking.

RULES:
- Answer based on the approved knowledge sources provided below.
- If the sources don't contain relevant information, say so warmly and suggest the user reach out to their budget office or reply to this email for further help.
- Provide guidance and policy interpretation only — never execute transactions, approvals, or system actions.
- Cite sources naturally (e.g. "According to the FY26 Guidelines..." or "The Capital Projects Policy notes that...").
- Do NOT use bullet-heavy formatting — this is an email reply, so use clear paragraphs.
- End with a friendly closing like "Feel free to reply if you have follow-up questions!"
- Do NOT include a greeting like "Dear ..." or a sign-off like "Sincerely" — those will be added automatically.

APPROVED KNOWLEDGE SOURCES:
${knowledgeContext}`;

  // 4. Call OpenAI
  if (!env.openAiApiKey) {
    if (!citations.length) {
      return "I wasn't able to find matching information in our approved knowledge base for your question. Please reach out to your budget office directly for assistance.";
    }
    return `Based on our approved knowledge sources (${[...new Set(citations.map((c) => c.domain))].join(", ")}), I can see there is relevant guidance available. Please contact your budget office to get the most accurate and up-to-date answer for your specific situation.`;
  }

  try {
    const completion = await getOpenAiClient().chat.completions.create({
      model: env.openAiChatModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: queryText }
      ],
      temperature: 0.5,
      max_tokens: 2000
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error("[EmailResponder] OpenAI call failed:", err.message);
    throw err;
  }
}

// ── Email sending ──────────────────────────────────────────────────────────────

/** Format the outbound reply as plain text + basic HTML. */
function buildReplyContent(responseText, originalSubject, senderName) {
  const greeting = senderName ? `Hi ${senderName.split(" ")[0]},` : "Hi,";
  const replySubject = originalSubject
    ? (originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`)
    : "Re: Your Budget Question";

  const plainText =
    `${greeting}\n\nThank you for reaching out to the Budget Assistant.\n\n` +
    `${responseText}\n\n` +
    `Feel free to reply if you have any follow-up questions.\n\n` +
    `Best regards,\nBudget Assistant\nbudgetassistant@stlcc.edu`;

  const html =
    `<p>${greeting}</p>` +
    `<p>Thank you for reaching out to the Budget Assistant.</p>` +
    `<div style="margin:16px 0;padding:12px 16px;border-left:3px solid #2563eb;background:#f0f7ff;">` +
    `${responseText.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}` +
    `</div>` +
    `<p>Feel free to reply if you have any follow-up questions.</p>` +
    `<p style="color:#6b7280;font-size:0.9em;">Best regards,<br><strong>Budget Assistant</strong><br>` +
    `<a href="mailto:budgetassistant@stlcc.edu">budgetassistant@stlcc.edu</a></p>`;

  return { replySubject, plainText, html };
}

/** Send reply via M365 Graph API (sendMail endpoint). */
async function sendReplyM365(config, toEmail, replySubject, plainText, html) {
  // Acquire token
  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default"
  });
  const tokenResp = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tokenBody }
  );
  if (!tokenResp.ok) {
    const err = await tokenResp.json().catch(() => ({}));
    throw new Error(`M365 token error: ${err.error_description || "unknown"}`);
  }
  const { access_token } = await tokenResp.json();

  // Send via Graph sendMail
  const sendResp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${config.mailbox}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: replySubject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: toEmail } }]
        },
        saveToSentItems: true
      })
    }
  );
  if (!sendResp.ok) {
    const errBody = await sendResp.text();
    throw new Error(`M365 sendMail failed (${sendResp.status}): ${errBody.slice(0, 300)}`);
  }
}

/** Send reply via nodemailer (Gmail App Password or SMTP). */
async function sendReplySmtp(smtpConfig, toEmail, replySubject, plainText, html) {
  const transporter = nodemailer.createTransport(smtpConfig);
  try {
    await transporter.sendMail({
      from: smtpConfig.auth.user,
      to: toEmail,
      subject: replySubject,
      text: plainText,
      html
    });
  } finally {
    transporter.close();
  }
}

/** Dispatch reply through the correct provider. */
async function sendReply(provider, config, toEmail, senderName, originalSubject, responseText) {
  const { replySubject, plainText, html } = buildReplyContent(responseText, originalSubject, senderName);

  if (provider === "m365") {
    await sendReplyM365(config, toEmail, replySubject, plainText, html);
  } else if (provider === "gmail") {
    await sendReplySmtp(
      { host: "smtp.gmail.com", port: 587, secure: false, auth: { user: config.mailbox, pass: config.appPassword } },
      toEmail,
      replySubject,
      plainText,
      html
    );
  } else if (provider === "smtp") {
    const port = Number(config.smtpPort) || 587;
    await sendReplySmtp(
      { host: config.smtpHost, port, secure: port === 465, auth: { user: config.username || config.mailbox, pass: config.password } },
      toEmail,
      replySubject,
      plainText,
      html
    );
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Provider-specific inbox fetchers ──────────────────────────────────────────

/** Fetch recent messages from M365 inbox and process each one. */
async function pollM365Inbox(config) {
  // Acquire token
  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default"
  });
  const tokenResp = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tokenBody }
  );

  if (!tokenResp.ok) {
    const err = await tokenResp.json().catch(() => ({}));
    throw new Error(`M365 token error: ${err.error_description || "unknown"}`);
  }
  const { access_token } = await tokenResp.json();

  // Fetch 50 most recent inbox messages (only need body + basic metadata)
  const msgsResp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${config.mailbox}/mailFolders/inbox/messages` +
    `?$top=50&$select=id,subject,receivedDateTime,from,body&$orderby=receivedDateTime desc`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  if (!msgsResp.ok) {
    const errBody = await msgsResp.json().catch(() => ({}));
    throw new Error(`Graph API messages fetch failed: ${errBody?.error?.message || msgsResp.statusText}`);
  }

  const { value: messages = [] } = await msgsResp.json();
  let processed = 0;
  let replied = 0;
  let skipped = 0;

  for (const msg of messages) {
    const externalMessageId = `m365_inbox_${msg.id}`;

    try {
      if (await isAlreadyProcessed(externalMessageId)) continue;

      const senderEmail = msg.from?.emailAddress?.address || "";
      const senderName = msg.from?.emailAddress?.name || "";
      const subject = msg.subject || "";
      const receivedAt = msg.receivedDateTime ? new Date(msg.receivedDateTime) : null;

      // Extract plain-text body (Graph returns HTML; strip tags for AI)
      const rawBody = msg.body?.content || "";
      const bodyText = rawBody.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
      const queryText = extractUserQuery(bodyText);

      // Skip auto-replies and empty bodies
      if (!queryText || isAutoReply(subject, senderEmail)) {
        await insertPending({ externalMessageId, senderEmail, senderName, subject, queryText: queryText || "(empty)", receivedAt });
        await markSkipped(externalMessageId);
        skipped++;
        continue;
      }

      await insertPending({ externalMessageId, senderEmail, senderName, subject, queryText, receivedAt });
      processed++;

      try {
        const responseText = await generateEmailResponse(queryText);
        await sendReply("m365", config, senderEmail, senderName, subject, responseText);
        await markReplied(externalMessageId, responseText);
        replied++;
        console.log(`[EmailResponder] Replied to ${senderEmail} (M365)`);
      } catch (replyErr) {
        await markFailed(externalMessageId, replyErr.message);
        console.error(`[EmailResponder] Failed to reply to ${senderEmail}:`, replyErr.message);
      }
    } catch (outerErr) {
      console.error(`[EmailResponder] Error processing M365 message ${msg.id}:`, outerErr.message);
    }
  }

  return { processed, replied, skipped };
}

/** Fetch recent messages from IMAP inbox (Gmail or SMTP) and process each one. */
async function pollImapInbox(imapConfig, provider, smtpSendConfig) {
  const client = new ImapFlow({
    host: imapConfig.host,
    port: imapConfig.port || (imapConfig.secure ? 993 : 143),
    secure: imapConfig.secure !== false,
    auth: imapConfig.auth,
    logger: false
  });

  await client.connect();

  let processed = 0;
  let replied = 0;
  let skipped = 0;

  try {
    const lock = await client.getMailboxLock("INBOX");

    try {
      const status = await client.status("INBOX", { messages: true });
      const total = status.messages || 0;
      const rangeStart = Math.max(1, total - 49);

      for await (const msg of client.fetch(`${rangeStart}:*`, {
        envelope: true,
        bodyParts: ["TEXT"],
        source: true
      })) {
        const messageId = msg.envelope?.messageId || `imap_seq_${msg.seq}`;
        const externalMessageId = `${provider}_inbox_${messageId}`;

        try {
          if (await isAlreadyProcessed(externalMessageId)) continue;

          const senderEmail = msg.envelope?.from?.[0]?.address || "";
          const senderName = msg.envelope?.from?.[0]?.name || "";
          const subject = msg.envelope?.subject || "";
          const receivedAt = msg.envelope?.date ? new Date(msg.envelope.date) : null;

          // Read the raw source to get body text
          const sourceBuffer = msg.source;
          const rawSource = sourceBuffer ? sourceBuffer.toString("utf8") : "";

          // Very lightweight body extraction: grab text after the blank line separator
          const bodyStart = rawSource.indexOf("\r\n\r\n");
          const rawBody = bodyStart !== -1 ? rawSource.slice(bodyStart + 4) : rawSource;
          // Strip quoted-printable soft line breaks and HTML tags
          const bodyText = rawBody
            .replace(/=\r?\n/g, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();
          const queryText = extractUserQuery(bodyText);

          if (!queryText || isAutoReply(subject, senderEmail)) {
            await insertPending({ externalMessageId, senderEmail, senderName, subject, queryText: queryText || "(empty)", receivedAt });
            await markSkipped(externalMessageId);
            skipped++;
            continue;
          }

          await insertPending({ externalMessageId, senderEmail, senderName, subject, queryText, receivedAt });
          processed++;

          try {
            const responseText = await generateEmailResponse(queryText);
            await sendReply(provider, smtpSendConfig, senderEmail, senderName, subject, responseText);
            await markReplied(externalMessageId, responseText);
            replied++;
            console.log(`[EmailResponder] Replied to ${senderEmail} (${provider})`);
          } catch (replyErr) {
            await markFailed(externalMessageId, replyErr.message);
            console.error(`[EmailResponder] Failed to reply to ${senderEmail}:`, replyErr.message);
          }
        } catch (innerErr) {
          console.error(`[EmailResponder] Error processing IMAP message seq ${msg.seq}:`, innerErr.message);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return { processed, replied, skipped };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run one full poll cycle.
 * Reads the active email_integrations row, then dispatches to the
 * appropriate provider handler.
 *
 * Returns { processed, replied, skipped } counts.
 */
export async function runEmailResponderCycle() {
  const row = await pool.query(
    "SELECT provider, config, status FROM email_integrations ORDER BY updated_at DESC LIMIT 1"
  );

  if (!row.rowCount || row.rows[0].status !== "connected") {
    console.log("[EmailResponder] No connected email integration — skipping cycle.");
    return { processed: 0, replied: 0, skipped: 0 };
  }

  const { provider, config } = row.rows[0];

  if (provider === "m365") {
    return pollM365Inbox(config);
  }

  if (provider === "gmail") {
    return pollImapInbox(
      { host: "imap.gmail.com", port: 993, secure: true, auth: { user: config.mailbox, pass: config.appPassword } },
      "gmail",
      config  // sendReply reads config.mailbox / config.appPassword
    );
  }

  if (provider === "smtp") {
    const imapHost = config.imapHost || config.smtpHost;
    const imapPort = Number(config.imapPort) || 993;
    return pollImapInbox(
      { host: imapHost, port: imapPort, secure: imapPort === 993, auth: { user: config.username || config.mailbox, pass: config.password } },
      "smtp",
      config
    );
  }

  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Returns a summary for the admin dashboard:
 *   - total, replied, failed, skipped, pending counts
 *   - last 10 processed emails (newest first)
 */
export async function getResponderStatus() {
  const countsResult = await pool.query(
    `SELECT
       COUNT(*)                                        AS total,
       COUNT(*) FILTER (WHERE status = 'replied')     AS replied,
       COUNT(*) FILTER (WHERE status = 'failed')      AS failed,
       COUNT(*) FILTER (WHERE status = 'skipped')     AS skipped,
       COUNT(*) FILTER (WHERE status = 'pending')     AS pending,
       MAX(replied_at)                                AS last_replied_at
     FROM email_inbox_queries`
  );

  const recentResult = await pool.query(
    `SELECT id, sender_email, sender_name, subject, status, received_at, replied_at, error_message
     FROM email_inbox_queries
     ORDER BY created_at DESC
     LIMIT 10`
  );

  return {
    counts: countsResult.rows[0],
    recent: recentResult.rows
  };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let responderTimer = null;

/**
 * Start the email responder polling loop.
 * intervalMs — how often to check the inbox (default: 5 minutes).
 * Runs immediately on start, then on the given interval.
 */
export function startEmailResponderScheduler(intervalMs = 5 * 60 * 1000) {
  if (responderTimer) return; // already running

  async function cycle() {
    try {
      const stats = await runEmailResponderCycle();
      if (stats.processed > 0 || stats.replied > 0) {
        console.log(`[EmailResponder] Cycle complete — processed: ${stats.processed}, replied: ${stats.replied}, skipped: ${stats.skipped}`);
      }
    } catch (err) {
      console.error("[EmailResponder] Cycle error:", err.message);
    }
  }

  // Run once immediately, then schedule
  cycle();
  responderTimer = setInterval(cycle, intervalMs);
  console.log(`[EmailResponder] Scheduler started — polling every ${Math.round(intervalMs / 60000)} min`);
}

export function stopEmailResponderScheduler() {
  if (responderTimer) {
    clearInterval(responderTimer);
    responderTimer = null;
    console.log("[EmailResponder] Scheduler stopped.");
  }
}
