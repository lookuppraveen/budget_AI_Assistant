import OpenAI from "openai";
import { pool } from "../../config/db.js";
import { env } from "../../config/env.js";
import { searchKnowledgeChunks } from "../retrieval/retrieval.service.js";

let openAiClient = null;

function getOpenAiClient() {
  if (!openAiClient) {
    openAiClient = new OpenAI({ apiKey: env.openAiApiKey });
  }
  return openAiClient;
}

function toMessagePayload(row) {
  return {
    id: row.id,
    role: row.role,
    source: row.source,
    text: row.content,
    agentType: row.agent_type || null,
    citations: Array.isArray(row.metadata?.citations) ? row.metadata.citations : [],
    suggestions: Array.isArray(row.metadata?.suggestions) ? row.metadata.suggestions : [],
    createdAt: row.created_at
  };
}

/**
 * Extract the JSON suggestions block appended by the LLM.
 * Returns { cleanText, suggestions } — cleanText has the JSON stripped out.
 */
function parseSuggestions(rawText = "") {
  try {
    // Match the last {...} block that contains a "suggestions" key
    const match = rawText.match(/\{[\s\S]*"suggestions"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (!match) return { cleanText: rawText.trim(), suggestions: [] };

    const parsed = JSON.parse(match[0]);
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s) => typeof s === "string" && s.trim()).slice(0, 4)
      : [];

    const cleanText = rawText.slice(0, rawText.lastIndexOf(match[0])).trim();
    return { cleanText: cleanText || rawText.trim(), suggestions };
  } catch {
    return { cleanText: rawText.trim(), suggestions: [] };
  }
}

// ── Drafting mode detection ───────────────────────────────────────────────────
// Returns true when the user message is clearly a drafting/writing request
const DRAFT_PATTERNS = [
  /\bdraft\b/i,
  /\bwrite\b/i,
  /\bcompose\b/i,
  /\bhelp me write\b/i,
  /\bprepare\b.*\b(email|letter|memo|summary|justification|response|reply|note)\b/i,
  /\bcreate\b.*\b(email|letter|memo|summary|justification|response|reply|note)\b/i,
  /\bgenerate\b.*\b(email|letter|memo|summary|justification|response|reply|note)\b/i,
  /\b(email|letter|memo|justification|response|reply)\b.*\bfor\b/i
];

function isDraftRequest(message) {
  return DRAFT_PATTERNS.some((pattern) => pattern.test(message));
}

// ── Human escalation ──────────────────────────────────────────────────────────
const ESCALATION_CONFIDENCE_THRESHOLD = 0.5;

async function escalateToHumanReview({ conversationId, userMessageId, assistantMessageId, userId, userQuery, aiResponse, citations }) {
  try {
    const topScore = citations?.[0]?.score ?? 0;
    if (topScore >= ESCALATION_CONFIDENCE_THRESHOLD) return; // no escalation needed

    const topCitation = citations?.[0]?.title || null;

    await pool.query(
      `INSERT INTO human_review_queue
         (conversation_id, user_message_id, assistant_message_id, user_id,
          user_query, ai_response, confidence_score, top_citation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        conversationId,
        userMessageId,
        assistantMessageId,
        userId,
        userQuery.slice(0, 2000),
        aiResponse ? aiResponse.slice(0, 4000) : null,
        topScore,
        topCitation
      ]
    );
  } catch (err) {
    // Escalation failure must never crash the chat turn
    console.error("Failed to escalate low-confidence response to review queue:", err.message);
  }
}

async function searchApprovedKnowledge(message, departmentId = null) {
  const semanticMatches = await searchKnowledgeChunks(message, 15, departmentId);
  const citationMap = new Map();
  const chunks = [];

  for (const match of semanticMatches) {
    chunks.push({
      content: match.content,
      title: match.title,
      domain: match.domain,
      score: Number(match.score.toFixed(4))
    });

    const key = match.document_id;
    if (!citationMap.has(key) && citationMap.size < 5) {
      citationMap.set(key, {
        id: match.document_id,
        title: match.title,
        domain: match.domain,
        source_type: match.source_type,
        department: match.department,
        excerpt: match.content.slice(0, 220),
        score: Number(match.score.toFixed(4))
      });
    }
  }

  return {
    citations: Array.from(citationMap.values()),
    chunks
  };
}

// ── Budget request relevance detection ───────────────────────────────────────
const BUDGET_REQUEST_PATTERNS = [
  /\bbudget request(s)?\b/i,
  /\bFTE\b/,
  /\bfull.?time equivalent\b/i,
  /\brequested amount\b/i,
  /\bjustification\b/i,
  /\bbase budget\b/i,
  /\bone.?time\b/i,
  /\brecurring\b/i,
  /\bfund type\b/i,
  /\bexpense categor/i,
  /\bpriority\b/i,
  /\bapproved request\b/i,
  /\bpending request\b/i,
  /\bsubmitted request\b/i,
  /\bhow much (did|does|is|was)\b/i,
  /\bwhat (was|is) (the |a )?(request|budget|amount)\b/i,
  /\btell me about\b/i,
  /\bshow me\b/i,
];

function isBudgetRequestQuestion(message) {
  return BUDGET_REQUEST_PATTERNS.some((p) => p.test(message));
}

/**
 * Fetch up to 20 budget requests relevant to the user's question.
 * Uses full-text + keyword search across title, justification, department, fiscal year.
 */
async function fetchRelevantBudgetRequests(message, departmentId = null) {
  try {
    // Extract fiscal year mention (e.g. FY26, FY2026)
    const fyMatch = message.match(/\bFY\s*(\d{2,4})\b/i);
    const fiscalYear = fyMatch ? `FY${fyMatch[1].slice(-2).padStart(2, "0")}` : null;

    // Build a tsquery-safe search string from the message
    const words = message
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 10)
      .map((w) => w + ":*")
      .join(" | ");

    const params = [];
    const conditions = [];

    if (words) {
      params.push(words);
      conditions.push(`(
        to_tsvector('english', coalesce(br.title,'') || ' ' || coalesce(br.justification,'') || ' ' || coalesce(d.name,''))
        @@ to_tsquery('english', $${params.length})
      )`);
    }

    if (fiscalYear) {
      params.push(`FY${fyMatch[1]}`);
      conditions.push(`br.fiscal_year ILIKE $${params.length}`);
    }

    if (departmentId) {
      params.push(departmentId);
      conditions.push(`br.department_id = $${params.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" OR ")}`
      : "";

    const result = await pool.query(
      `SELECT
         br.id, br.title, br.fiscal_year, br.fund_type, br.expense_category,
         br.request_type, br.cost_type,
         br.base_budget_amount, br.requested_amount,
         br.recurring_amount, br.one_time_amount,
         br.justification, br.strategic_alignment, br.impact_description,
         br.status, br.priority, br.ai_summary,
         br.risk_flag, br.risk_reason,
         d.name AS department_name
       FROM budget_requests br
       JOIN departments d ON d.id = br.department_id
       ${whereClause}
       ORDER BY br.updated_at DESC
       LIMIT 20`,
      params
    );

    return result.rows;
  } catch (err) {
    console.error("fetchRelevantBudgetRequests failed:", err.message);
    return [];
  }
}

/**
 * Formats budget request rows into a readable context block for the LLM.
 */
function formatBudgetRequestsContext(rows) {
  if (!rows.length) return "";
  const lines = rows.map((r) => {
    const fmt = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    const parts = [
      `Title: ${r.title}`,
      `Department: ${r.department_name}`,
      `Fiscal Year: ${r.fiscal_year}`,
      `Status: ${r.status}`,
      `Priority: ${r.priority || "—"}`,
      `Fund Type: ${r.fund_type || "—"}`,
      `Expense Category: ${r.expense_category || "—"}`,
      `Request Type: ${r.request_type || "—"}`,
      `Base Budget: ${fmt(r.base_budget_amount)}`,
      `Requested Amount: ${fmt(r.requested_amount)}`,
      `Recurring Amount: ${fmt(r.recurring_amount)}`,
      `One-Time Amount: ${fmt(r.one_time_amount)}`,
    ];
    if (r.justification) parts.push(`Justification: ${r.justification.slice(0, 400)}`);
    if (r.strategic_alignment) parts.push(`Strategic Alignment: ${r.strategic_alignment.slice(0, 200)}`);
    if (r.impact_description) parts.push(`Impact: ${r.impact_description.slice(0, 200)}`);
    if (r.ai_summary) parts.push(`AI Summary: ${r.ai_summary.slice(0, 200)}`);
    if (r.risk_flag) parts.push(`Risk: ${r.risk_reason || "flagged"}`);
    return parts.join("\n");
  });
  return `LIVE BUDGET REQUESTS DATA (${rows.length} record${rows.length !== 1 ? "s" : ""}):\n\n` + lines.join("\n\n---\n\n");
}

function buildFallbackResponse(message, citations) {
  const normalized = message.toLowerCase();

  if (!citations.length) {
    return "I could not find matching approved knowledge for that question yet. Please ask an admin to approve relevant documents in Document Management, then I can answer with citations.";
  }

  const domainList = [...new Set(citations.map((c) => c.domain))].join(", ");
  const topSource = citations[0];

  if (normalized.includes("carryforward")) {
    return `Based on approved sources in ${domainList}, carryforward decisions should follow fiscal-year close controls, department review, and policy exception checks. Start with "${topSource.title}" for your department-specific rules.`;
  }

  if (normalized.includes("banner")) {
    return `Based on approved sources in ${domainList}, Banner guidance should validate account string, submission period, and approver chain before routing. Use "${topSource.title}" as the primary reference.`;
  }

  if (normalized.includes("deadline")) {
    return `Approved sources in ${domainList} indicate deadline guidance should include submission cutoff, revision window, and executive review checkpoints. "${topSource.title}" is the best starting source.`;
  }

  return `Guidance-only response from approved knowledge (${domainList}): I can provide policy interpretation and process support, but I do not execute live approvals or transactions. Start with "${topSource.title}" and related cited sources below.`;
}

// ── Multi-agent classification ────────────────────────────────────────────────

const AGENT_PATTERNS = {
  policy: [
    /\bpolic(y|ies)\b/i, /\bguideline/i, /\bcompliance\b/i, /\bregulation\b/i,
    /\baccreditation\b/i, /\bmandate\b/i, /\brule\b/i, /\bprocedure\b/i,
    /\bapproval process\b/i, /\bwhat are the rules\b/i
  ],
  analyst: [
    /\bcompare\b/i, /\banalyze\b/i, /\banalysis\b/i, /\btrend\b/i,
    /\bvariance\b/i, /\bbreakdown\b/i, /\bbenchmark\b/i, /\bspending\b/i,
    /\bbudget request(s)?\b/i, /\bhow much\b/i, /\bhistor(y|ical)\b/i
  ],
  forecasting: [
    /\bforecast\b/i, /\bproject(ion|ed)?\b/i, /\bscenario\b/i,
    /\bif enrollment\b/i, /\bif state funding\b/i, /\bdeficit\b/i, /\bsurplus\b/i,
    /\bwhat (if|would happen)\b/i, /\bfuture\b/i, /\bnext year\b/i
  ],
  board: [
    /\bboard\b/i, /\bcabinet\b/i, /\bexecutive (summary|brief)\b/i,
    /\bpresent(ation)?\b/i, /\btalking point/i, /\bsummariz(e|ing)\b/i,
    /\bhigh.?level\b/i, /\bpresident\b/i, /\bstakeholder\b/i
  ],
  drafting: DRAFT_PATTERNS
};

function classifyQuery(message) {
  for (const [agent, patterns] of Object.entries(AGENT_PATTERNS)) {
    if (patterns.some((p) => p.test(message))) return agent;
  }
  return "general";
}

// Agent-specific system prompt additions (merged into base prompt)
const AGENT_SYSTEM_ADDONS = {
  policy: `
AGENT MODE: Policy Specialist
- You are answering as a policy and compliance expert.
- Lead with the specific rule, regulation, or policy that applies.
- Cite the exact policy document name and section when available.
- Flag compliance risks or exceptions clearly.
- Avoid speculative interpretation — if the policy is silent, say so.`,

  analyst: `
AGENT MODE: Budget Analyst
- You are answering as a data-driven budget analyst.
- Use numbers, percentages, and comparisons from the knowledge sources where available.
- Structure your answer with clear data points before interpretation.
- Highlight trends, anomalies, or variances when relevant.
- Flag data gaps or assumptions explicitly.`,

  forecasting: `
AGENT MODE: Forecasting Specialist
- You are answering as a financial forecasting expert.
- Clearly state assumptions behind any projections.
- Use scenario framing: best-case, expected, constrained when helpful.
- Quantify uncertainty — avoid presenting forecasts as certainties.
- Reference scenario planning data or historical trends from knowledge sources.`,

  board: `
AGENT MODE: Executive Communications
- You are preparing content for board/cabinet-level audiences.
- Use concise, executive language — no jargon, no technical weeds.
- Lead with the headline: what decision is needed, what is the financial impact.
- Structure as: situation → implication → recommended action.
- Keep to 3–5 key points maximum. Bullet points are appropriate here.`,

  drafting: `
AGENT MODE: Document Drafter
- Produce a complete, polished draft ready for use.
- Do not write a skeleton or outline — write the actual document.
- Use formal professional language appropriate for institutional communications.
- After the draft, add a brief Notes: section (2–3 bullets) with key assumptions.`,

  general: ""
};

// ── Budget context note builder ───────────────────────────────────────────────
function buildContextNote(ctx = {}) {
  if (!ctx || typeof ctx !== "object") return "";
  const parts = [];
  if (ctx.department) parts.push(`Department: ${ctx.department}`);
  if (ctx.fundType)   parts.push(`Fund Type: ${ctx.fundType}`);
  if (ctx.fiscalYear) parts.push(`Fiscal Year: ${ctx.fiscalYear}`);
  if (ctx.topic)      parts.push(`Current Topic: ${ctx.topic}`);
  return parts.join(" | ");
}

// Shared: build the system prompt and message array for OpenAI
function buildOpenAiMessages(message, chunks, history, source, budgetContext = {}, agentType = "general", budgetRequestsContext = "") {
  const grouped = new Map();
  for (const chunk of chunks) {
    if (!grouped.has(chunk.title)) grouped.set(chunk.title, []);
    grouped.get(chunk.title).push(chunk);
  }

  let sourceIndex = 0;
  const knowledgeContext = chunks.length
    ? Array.from(grouped.entries())
        .map(([title, docChunks]) =>
          docChunks
            .map((c) => {
              sourceIndex++;
              const scorePct = typeof c.score === "number" ? ` — relevance: ${(c.score * 100).toFixed(0)}%` : "";
              return `[Source ${sourceIndex}: "${title}" (${c.domain})${scorePct}]\n${c.content}`;
            })
            .join("\n\n")
        )
        .join("\n\n---\n\n")
    : "No approved knowledge found for this query.";

  // ── Draft mode system prompt ─────────────────────────────────────────────
  const draftMode = isDraftRequest(message);
  if (draftMode) {
    const contextNote = buildContextNote(budgetContext);
    const draftSystemPrompt = `You are a professional Budget Assistant helping staff draft formal budget communications for STLCC.

Your job is to produce a complete, ready-to-use draft based on the user's request and the approved knowledge sources below.

DRAFTING RULES:
- Produce a full, polished draft — not a skeleton or outline.
- Use formal, professional language appropriate for budget communications.
- Structure the draft clearly: opening/subject, body paragraphs, closing.
- Weave in relevant policy references naturally (e.g. "Per the FY26 Budget Guidelines...").
- If the sources contain specific amounts, procedures, or policy language, use them accurately.
- Do not invent figures or policies not found in the sources.
- After the draft, add a brief "Notes:" section (2–3 bullet points) explaining key choices and suggesting the user verify any figures against live data.${contextNote ? `\n\nACTIVE BUDGET CONTEXT:\n${contextNote}` : ""}

APPROVED KNOWLEDGE SOURCES:
${knowledgeContext}${budgetRequestsContext ? `\n\n${budgetRequestsContext}` : ""}`;

    const messages = [{ role: "system", content: draftSystemPrompt }];
    for (const turn of history.slice(-6)) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({ role: "user", content: message });
    return messages;
  }

  // ── Budget context note for regular answers ──────────────────────────────
  const contextNote = buildContextNote(budgetContext);

  const voiceGuidance = source === "voice"
    ? `\n- This response will be spoken aloud by text-to-speech so it must sound like natural, friendly conversation — not a written document.
- Tone: warm, approachable, and conversational. Imagine explaining this to a friend who asked you about it — knowledgeable but relaxed, not stiff or corporate.
- Use contractions freely: it's, you'll, we've, that's, here's, let's, isn't, doesn't, won't.
- Keep sentences short and punchy. One idea per sentence. Pause naturally between thoughts.
- It's fine to open with a brief friendly acknowledgement like "Great question!", "So here's the thing —", "Yeah, so basically —", or "Sure!" when it fits naturally. Don't overdo it.
- Vary your sentence length and rhythm so it doesn't sound monotone when read aloud.
- Do NOT use bullet points, numbered lists, bold text, headers, dashes for lists, or any markdown. No asterisks, no hashes, no colons introducing lists.
- Do NOT say things like "Based on the provided sources" or "According to my knowledge". Just say it naturally, as if you already know it.
- Keep the response concise — under 4–5 sentences for simple questions, up to 8–10 for complex ones.`
    : "";

  const suggestionsGuidance = source !== "voice"
    ? `

FOLLOW-UP SUGGESTIONS:
After your answer, append exactly this JSON block on a new line — no explanation, no markdown fences, just the raw JSON:
{"suggestions": ["<question 1>", "<question 2>", "<question 3>"]}
- Write 3 short follow-up questions (under 60 characters each) the user would naturally ask next.
- Make them specific to what you just answered, not generic.
- Do NOT include this JSON inside your prose — it must appear only at the very end.`
    : "";

  const agentAddon = AGENT_SYSTEM_ADDONS[agentType] || "";

  const systemPrompt = `You are a warm, knowledgeable Budget Assistant — think of yourself as a helpful colleague who happens to know all the budget policies inside out. Your job is to help staff understand policies, procedures, and guidelines in a friendly and approachable way.${agentAddon}${contextNote ? `\n\nACTIVE BUDGET CONTEXT (scope your answer to this context when relevant):\n${contextNote}` : ""}

PERSONALITY:
- Speak naturally and conversationally, like a trusted colleague — not like a formal document or an IVR system.
- Use contractions (you'll, I'd, that's, here's) to sound human.
- Keep your tone warm and supportive. Avoid stiff corporate language.
- Answer the question first, then give context — don't bury the answer.
- Match your response length to the complexity of the question. For simple or factual questions, 2–4 sentences is ideal. For complex questions that genuinely require detail, answer fully — but don't pad, repeat, or over-explain beyond what was asked.
- When multiple sources are relevant, synthesize them together into a cohesive narrative rather than listing them separately.

RULES:
- Answer based on the approved knowledge sources and live budget requests data provided below.
- If neither source contains relevant information, say so warmly and suggest the user reach out to their budget office.
- Provide guidance and policy interpretation only — never execute transactions, approvals, or system actions.
- Cite sources by weaving document titles naturally into your response (e.g. "According to the FY26 Guidelines..." or "The Capital Projects Policy notes that..."). When drawing from multiple sources, reference each one where it contributes.
- When answering from live budget requests data, reference specific fields (title, department, amount, status) accurately and precisely.
- If you find information about a specific person, project, or line item mentioned across multiple sources, consolidate what each source says into a unified summary.
- Structure longer answers with clear paragraphs. Use brief headers only when the answer covers multiple distinct topics.
- Don't make up anything that isn't in the sources.${voiceGuidance}${suggestionsGuidance}

APPROVED KNOWLEDGE SOURCES:
${knowledgeContext}${budgetRequestsContext ? `\n\n${budgetRequestsContext}` : ""}`;

  const messages = [{ role: "system", content: systemPrompt }];
  for (const turn of history.slice(-10)) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: message });
  return messages;
}

// Non-streaming (kept for backward compatibility)
async function generateLlmResponse(message, chunks, citations, history, source = "text", budgetContext = {}, agentType = "general", budgetRequestsContext = "") {
  if (!env.openAiApiKey) return { text: buildFallbackResponse(message, citations), suggestions: [] };
  try {
    const messages = buildOpenAiMessages(message, chunks, history, source, budgetContext, agentType, budgetRequestsContext);
    const completion = await getOpenAiClient().chat.completions.create({
      model: env.openAiChatModel,
      messages,
      temperature: 0.5,
      max_tokens: 2000
    });
    const raw = completion.choices[0].message.content.trim();
    const { cleanText, suggestions } = parseSuggestions(raw);
    return { text: cleanText, suggestions };
  } catch (error) {
    console.error("OpenAI chat completion failed, falling back to template response.", error.message);
    return { text: buildFallbackResponse(message, citations), suggestions: [] };
  }
}

// Streaming — calls onToken(chunk) for each visible token, returns { text, suggestions }
// Buffers the JSON suggestions tail so it never appears in the streamed UI output.
async function streamLlmResponse(message, chunks, citations, history, source, onToken, budgetContext = {}, agentType = "general", budgetRequestsContext = "") {
  if (!env.openAiApiKey) {
    const fallback = buildFallbackResponse(message, citations);
    onToken(fallback);
    return { text: fallback, suggestions: [] };
  }
  try {
    const messages = buildOpenAiMessages(message, chunks, history, source, budgetContext, agentType, budgetRequestsContext);
    const stream = await getOpenAiClient().chat.completions.create({
      model: env.openAiChatModel,
      messages,
      temperature: 0.5,
      max_tokens: 2000,
      stream: true
    });

    let fullText = "";
    // We emit tokens normally during streaming, then strip the JSON block
    // from the final stored text. The JSON block appears at the very end
    // so the user sees it briefly — parseSuggestions removes it from DB/display.
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) {
        fullText += token;
        onToken(token);
      }
    }

    const { cleanText, suggestions } = parseSuggestions(fullText);
    return { text: cleanText, suggestions };
  } catch (error) {
    console.error("OpenAI streaming failed, using fallback.", error.message);
    const fallback = buildFallbackResponse(message, citations);
    onToken(fallback);
    return { text: fallback, suggestions: [] };
  }
}

async function getOwnedConversation(client, conversationId, userId) {
  const result = await client.query("SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2", [
    conversationId,
    userId
  ]);

  if (result.rowCount === 0) {
    const error = new Error("Conversation not found");
    error.statusCode = 404;
    throw error;
  }
}

export async function listConversations(userId, limit = 20) {
  const result = await pool.query(
    `SELECT id, title, last_message_at, created_at, updated_at
     FROM chat_conversations
     WHERE user_id = $1
     ORDER BY last_message_at DESC NULLS LAST, updated_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows;
}

export async function createConversation(userId, title) {
  const result = await pool.query(
    `INSERT INTO chat_conversations (user_id, title)
     VALUES ($1, $2)
     RETURNING id, title, last_message_at, created_at, updated_at`,
    [userId, title?.trim() || "Budget Assistant Conversation"]
  );

  return result.rows[0];
}

export async function getConversationMessages(conversationId, userId) {
  const client = await pool.connect();

  try {
    await getOwnedConversation(client, conversationId, userId);

    const result = await client.query(
      `SELECT id, role, source, content, metadata, agent_type, created_at
       FROM chat_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    return result.rows.map(toMessagePayload);
  } finally {
    client.release();
  }
}

export async function createChatTurn(userId, { conversationId, message, source }, departmentId = null) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let resolvedConversationId = conversationId;
    let budgetContext = {};

    if (resolvedConversationId) {
      await getOwnedConversation(client, resolvedConversationId, userId);
      // Load stored budget context for this conversation
      const ctxRes = await client.query(
        `SELECT budget_context FROM chat_conversations WHERE id = $1`,
        [resolvedConversationId]
      );
      budgetContext = ctxRes.rows[0]?.budget_context || {};
    } else {
      const conversationResult = await client.query(
        `INSERT INTO chat_conversations (user_id, title)
         VALUES ($1, $2)
         RETURNING id, title, last_message_at, created_at, updated_at`,
        [userId, "Budget Assistant Conversation"]
      );

      resolvedConversationId = conversationResult.rows[0].id;
    }

    // Fetch prior messages for multi-turn context
    const historyResult = await client.query(
      `SELECT role, content
       FROM chat_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [resolvedConversationId]
    );
    const history = historyResult.rows;

    const userMessageResult = await client.query(
      `INSERT INTO chat_messages (conversation_id, role, source, content)
       VALUES ($1, 'user', $2, $3)
       RETURNING id, role, source, content, created_at`,
      [resolvedConversationId, source, message.trim()]
    );

    const { citations, chunks } = await searchApprovedKnowledge(message.trim(), departmentId);

    const agentType = classifyQuery(message.trim());

    // Fetch live budget requests data when the question is about budget requests
    let budgetRequestsContext = "";
    if (isBudgetRequestQuestion(message.trim())) {
      const budgetRows = await fetchRelevantBudgetRequests(message.trim(), departmentId);
      budgetRequestsContext = formatBudgetRequestsContext(budgetRows);
    }

    const { text: assistantText, suggestions } = await generateLlmResponse(message.trim(), chunks, citations, history, source, budgetContext, agentType, budgetRequestsContext);

    const assistantMessageResult = await client.query(
      `INSERT INTO chat_messages (conversation_id, role, source, content, metadata, agent_type)
       VALUES ($1, 'assistant', 'text', $2, $3::jsonb, $4)
       RETURNING id, role, source, content, metadata, agent_type, created_at`,
      [
        resolvedConversationId,
        assistantText,
        JSON.stringify({
          suggestions,
          citations: citations.map((citation) => ({
            id: citation.id,
            title: citation.title,
            domain: citation.domain,
            sourceType: citation.source_type,
            department: citation.department,
            excerpt: citation.excerpt,
            score: citation.score
          }))
        }),
        agentType
      ]
    );

    await client.query(
      `UPDATE chat_conversations
       SET last_message_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [resolvedConversationId]
    );

    const conversationResult = await client.query(
      `SELECT id, title, last_message_at, created_at, updated_at
       FROM chat_conversations
       WHERE id = $1`,
      [resolvedConversationId]
    );

    await client.query("COMMIT");

    // Escalate to human review if confidence is low (runs after commit, non-blocking)
    await escalateToHumanReview({
      conversationId: resolvedConversationId,
      userMessageId: userMessageResult.rows[0].id,
      assistantMessageId: assistantMessageResult.rows[0].id,
      userId,
      userQuery: message.trim(),
      aiResponse: assistantText,
      citations
    });

    return {
      conversation: conversationResult.rows[0],
      userMessage: toMessagePayload(userMessageResult.rows[0]),
      assistantMessage: toMessagePayload(assistantMessageResult.rows[0])
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Streaming chat turn — uses SSE callbacks instead of returning a full response.
// onCitations(citations[]) — called once after knowledge search completes
// onToken(tokenString)     — called for each streamed token
// onDone({ conversation, userMessage, assistantMessage }) — called after DB save
export async function streamChatTurn(userId, { conversationId, message, source }, departmentId, onCitations, onToken, onDone) {
  // ── Phase 1: setup conversation + insert user message ────────────────────
  let resolvedConversationId = conversationId;
  let userMessageRow;
  let history;
  let budgetContext = {};

  {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (resolvedConversationId) {
        await getOwnedConversation(client, resolvedConversationId, userId);
        // Load stored budget context
        const ctxRes = await client.query(
          `SELECT budget_context FROM chat_conversations WHERE id = $1`,
          [resolvedConversationId]
        );
        budgetContext = ctxRes.rows[0]?.budget_context || {};
      } else {
        const r = await client.query(
          `INSERT INTO chat_conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
          [userId, "Budget Assistant Conversation"]
        );
        resolvedConversationId = r.rows[0].id;
      }

      const historyResult = await client.query(
        `SELECT role, content FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [resolvedConversationId]
      );
      history = historyResult.rows;

      const userMsg = await client.query(
        `INSERT INTO chat_messages (conversation_id, role, source, content)
         VALUES ($1, 'user', $2, $3)
         RETURNING id, role, source, content, created_at`,
        [resolvedConversationId, source, message.trim()]
      );
      userMessageRow = userMsg.rows[0];

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Phase 2: knowledge search + budget requests (no DB connection held) ──
  const { citations, chunks } = await searchApprovedKnowledge(message.trim(), departmentId);

  const agentType = classifyQuery(message.trim());

  // Fetch live budget requests data when the question is about budget requests
  let budgetRequestsContext = "";
  if (isBudgetRequestQuestion(message.trim())) {
    const budgetRows = await fetchRelevantBudgetRequests(message.trim(), departmentId);
    budgetRequestsContext = formatBudgetRequestsContext(budgetRows);
  }

  onCitations(citations);

  // ── Phase 3: stream OpenAI tokens ────────────────────────────────────────
  const { text: assistantText, suggestions } = await streamLlmResponse(message.trim(), chunks, citations, history, source, onToken, budgetContext, agentType, budgetRequestsContext);

  // ── Phase 4: save assistant message to DB ────────────────────────────────
  {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const assistantMsg = await client.query(
        `INSERT INTO chat_messages (conversation_id, role, source, content, metadata, agent_type)
         VALUES ($1, 'assistant', 'text', $2, $3::jsonb, $4)
         RETURNING id, role, source, content, metadata, agent_type, created_at`,
        [
          resolvedConversationId,
          assistantText,
          JSON.stringify({
            suggestions,
            citations: citations.map((c) => ({
              id: c.id, title: c.title, domain: c.domain,
              sourceType: c.source_type, department: c.department,
              excerpt: c.excerpt, score: c.score
            }))
          }),
          agentType
        ]
      );

      await client.query(
        `UPDATE chat_conversations SET last_message_at = now(), updated_at = now() WHERE id = $1`,
        [resolvedConversationId]
      );

      const conv = await client.query(
        `SELECT id, title, last_message_at, created_at, updated_at FROM chat_conversations WHERE id = $1`,
        [resolvedConversationId]
      );

      await client.query("COMMIT");

      onDone({
        conversation: conv.rows[0],
        userMessage: toMessagePayload(userMessageRow),
        assistantMessage: toMessagePayload(assistantMsg.rows[0])
      });

      // Escalate to human review if confidence is low (fire-and-forget)
      await escalateToHumanReview({
        conversationId: resolvedConversationId,
        userMessageId: userMessageRow.id,
        assistantMessageId: assistantMsg.rows[0].id,
        userId,
        userQuery: message.trim(),
        aiResponse: assistantText,
        citations
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

// ── Conversation budget context management ────────────────────────────────────

export async function updateConversationContext(conversationId, userId, context) {
  const client = await pool.connect();
  try {
    await getOwnedConversation(client, conversationId, userId);
    const result = await client.query(
      `UPDATE chat_conversations
       SET budget_context = $1::jsonb, updated_at = now()
       WHERE id = $2
       RETURNING id, title, budget_context, last_message_at, created_at, updated_at`,
      [JSON.stringify(context), conversationId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function getConversationContext(conversationId, userId) {
  const client = await pool.connect();
  try {
    await getOwnedConversation(client, conversationId, userId);
    const result = await client.query(
      `SELECT budget_context FROM chat_conversations WHERE id = $1`,
      [conversationId]
    );
    return result.rows[0]?.budget_context || {};
  } finally {
    client.release();
  }
}

// ── Human review queue management ────────────────────────────────────────────

export async function listReviewQueue({ status = "pending", limit = 50, offset = 0 } = {}) {
  const result = await pool.query(
    `SELECT
       q.id, q.user_query, q.ai_response, q.confidence_score, q.top_citation,
       q.status, q.reviewer_notes, q.created_at, q.reviewed_at,
       u.name AS user_name, u.email AS user_email,
       rv.name AS reviewer_name
     FROM human_review_queue q
     LEFT JOIN users u  ON u.id  = q.user_id
     LEFT JOIN users rv ON rv.id = q.reviewed_by
     WHERE q.status = $1
     ORDER BY q.created_at DESC
     LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  );

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM human_review_queue WHERE status = $1`,
    [status]
  );

  return { items: result.rows, total: countRes.rows[0].total };
}

export async function updateReviewQueueItem(itemId, reviewerId, { status, reviewerNotes }) {
  const result = await pool.query(
    `UPDATE human_review_queue
     SET status = $1,
         reviewer_notes = COALESCE($2, reviewer_notes),
         reviewed_by = $3,
         reviewed_at = now(),
         updated_at = now()
     WHERE id = $4
     RETURNING id, status, reviewer_notes, reviewed_at`,
    [status, reviewerNotes || null, reviewerId, itemId]
  );

  if (result.rowCount === 0) {
    const err = new Error("Review queue item not found");
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
}

export async function deleteConversation(conversationId, userId) {
  const result = await pool.query(
    "DELETE FROM chat_conversations WHERE id = $1 AND user_id = $2 RETURNING id",
    [conversationId, userId]
  );

  if (result.rowCount === 0) {
    const error = new Error("Conversation not found");
    error.statusCode = 404;
    throw error;
  }
}

// ── Chat feedback (continuous learning loop) ──────────────────────────────────

export async function saveFeedback(messageId, userId, { rating, correction, feedbackType }) {
  if (![1, -1].includes(rating)) {
    throw Object.assign(new Error("rating must be 1 (helpful) or -1 (not helpful)"), { statusCode: 400 });
  }

  // Verify message exists
  const msgRes = await pool.query(`SELECT id FROM chat_messages WHERE id = $1`, [messageId]);
  if (!msgRes.rowCount) throw Object.assign(new Error("Message not found"), { statusCode: 404 });

  const res = await pool.query(
    `INSERT INTO chat_feedback (message_id, user_id, rating, correction, feedback_type)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (message_id, user_id) DO UPDATE
       SET rating = EXCLUDED.rating,
           correction = EXCLUDED.correction,
           feedback_type = EXCLUDED.feedback_type
     RETURNING id, message_id, user_id, rating, correction, feedback_type, created_at`,
    [messageId, userId, rating, correction || null, feedbackType || null]
  );

  return res.rows[0];
}

// ── "Show me why" — per-answer explanation ────────────────────────────────────

export async function getMessageExplanation(messageId, userId) {
  // Any authenticated user can request explanation — no ownership check needed
  const res = await pool.query(
    `SELECT id, role, content, metadata, agent_type, created_at
     FROM chat_messages WHERE id = $1`,
    [messageId]
  );
  if (!res.rowCount) throw Object.assign(new Error("Message not found"), { statusCode: 404 });

  const msg = res.rows[0];
  const citations = msg.metadata?.citations || [];
  const suggestions = msg.metadata?.suggestions || [];

  // Agent type label map
  const agentLabels = {
    general:     "General Budget Assistant",
    policy:      "Policy Specialist Agent",
    analyst:     "Budget Analyst Agent",
    forecasting: "Forecasting Specialist Agent",
    board:       "Executive Communications Agent",
    drafting:    "Document Drafting Agent",
  };

  return {
    messageId: msg.id,
    role:      msg.role,
    agentType: msg.agent_type || "general",
    agentLabel:agentLabels[msg.agent_type] || agentLabels.general,
    citations,
    suggestions,
    explanation: citations.length
      ? `This answer was generated by the ${agentLabels[msg.agent_type] || agentLabels.general} using ${citations.length} approved knowledge source(s). The top source was "${citations[0]?.title}" with ${((citations[0]?.score || 0) * 100).toFixed(0)}% relevance.`
      : "This answer was generated without matching approved knowledge sources. No citations available.",
    topSourceExcerpt: citations[0]?.excerpt || null,
  };
}

export async function createVoiceLog(userId, { conversationId, eventType, direction, transcript, status, durationMs, metadata }) {
  const client = await pool.connect();

  try {
    if (conversationId) {
      await getOwnedConversation(client, conversationId, userId);
    }

    const result = await client.query(
      `INSERT INTO voice_session_logs (
         user_id, conversation_id, event_type, direction, transcript, status, duration_ms, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id, event_type, direction, transcript, status, duration_ms, created_at`,
      [
        userId,
        conversationId || null,
        eventType,
        direction,
        transcript || null,
        status || null,
        durationMs ?? null,
        JSON.stringify(metadata || {})
      ]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}
