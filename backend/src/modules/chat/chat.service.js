import OpenAI from "openai";
import { pool } from "../../config/db.js";
import { env } from "../../config/env.js";
import { indexAllApprovedDocuments, searchKnowledgeChunks } from "../retrieval/retrieval.service.js";

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
    citations: Array.isArray(row.metadata?.citations) ? row.metadata.citations : [],
    createdAt: row.created_at
  };
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

// Shared: build the system prompt and message array for OpenAI
function buildOpenAiMessages(message, chunks, history, source) {
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

  const voiceGuidance = source === "voice"
    ? `\n- This response will be read aloud by text-to-speech. Write in short, natural spoken sentences. Do NOT use bullet points, numbered lists, bold text, headers, or markdown of any kind. Speak as if talking directly to the person.`
    : "";

  const systemPrompt = `You are a warm, knowledgeable Budget Assistant — think of yourself as a helpful colleague who happens to know all the budget policies inside out. Your job is to help staff understand policies, procedures, and guidelines in a friendly and approachable way.

PERSONALITY:
- Speak naturally and conversationally, like a trusted colleague — not like a formal document or an IVR system.
- Use contractions (you'll, I'd, that's, here's) to sound human.
- Keep your tone warm and supportive. Avoid stiff corporate language.
- Answer the question first, then give context — don't bury the answer.
- Give thorough, detailed answers. Don't be terse — if the sources contain useful detail, share it. Think of each answer as a mini briefing for the person asking.
- When multiple sources are relevant, synthesize them together into a cohesive narrative rather than listing them separately.

RULES:
- Answer based on the approved knowledge sources provided below.
- If the sources don't contain relevant information, say so warmly and suggest the user reach out to their budget office.
- Provide guidance and policy interpretation only — never execute transactions, approvals, or system actions.
- Cite sources by weaving document titles naturally into your response (e.g. "According to the FY26 Guidelines..." or "The Capital Projects Policy notes that..."). When drawing from multiple sources, reference each one where it contributes.
- If you find information about a specific person, project, or line item mentioned across multiple sources, consolidate what each source says into a unified summary.
- Structure longer answers with clear paragraphs. Use brief headers only when the answer covers multiple distinct topics.
- Don't make up anything that isn't in the sources.${voiceGuidance}

APPROVED KNOWLEDGE SOURCES:
${knowledgeContext}`;

  const messages = [{ role: "system", content: systemPrompt }];
  for (const turn of history.slice(-10)) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: message });
  return messages;
}

// Non-streaming (kept for backward compatibility)
async function generateLlmResponse(message, chunks, citations, history, source = "text") {
  if (!env.openAiApiKey) return buildFallbackResponse(message, citations);
  try {
    const messages = buildOpenAiMessages(message, chunks, history, source);
    const completion = await getOpenAiClient().chat.completions.create({
      model: env.openAiChatModel,
      messages,
      temperature: 0.5,
      max_tokens: 2000
    });
    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error("OpenAI chat completion failed, falling back to template response.", error.message);
    return buildFallbackResponse(message, citations);
  }
}

// Streaming — calls onToken(chunk) for each token, returns full accumulated text
async function streamLlmResponse(message, chunks, citations, history, source, onToken) {
  if (!env.openAiApiKey) {
    const fallback = buildFallbackResponse(message, citations);
    onToken(fallback);
    return fallback;
  }
  try {
    const messages = buildOpenAiMessages(message, chunks, history, source);
    const stream = await getOpenAiClient().chat.completions.create({
      model: env.openAiChatModel,
      messages,
      temperature: 0.5,
      max_tokens: 2000,
      stream: true
    });

    let fullText = "";
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) {
        fullText += token;
        onToken(token);
      }
    }
    return fullText;
  } catch (error) {
    console.error("OpenAI streaming failed, using fallback.", error.message);
    const fallback = buildFallbackResponse(message, citations);
    onToken(fallback);
    return fallback;
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
      `SELECT id, role, source, content, metadata, created_at
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

    if (resolvedConversationId) {
      await getOwnedConversation(client, resolvedConversationId, userId);
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

    let { citations, chunks } = await searchApprovedKnowledge(message.trim(), departmentId);
    if (!citations.length) {
      await indexAllApprovedDocuments();
      ({ citations, chunks } = await searchApprovedKnowledge(message.trim(), departmentId));
    }

    const assistantText = await generateLlmResponse(message.trim(), chunks, citations, history, source);

    const assistantMessageResult = await client.query(
      `INSERT INTO chat_messages (conversation_id, role, source, content, metadata)
       VALUES ($1, 'assistant', 'text', $2, $3::jsonb)
       RETURNING id, role, source, content, metadata, created_at`,
      [
        resolvedConversationId,
        assistantText,
        JSON.stringify({
          citations: citations.map((citation) => ({
            id: citation.id,
            title: citation.title,
            domain: citation.domain,
            sourceType: citation.source_type,
            department: citation.department,
            excerpt: citation.excerpt,
            score: citation.score
          }))
        })
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

  {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (resolvedConversationId) {
        await getOwnedConversation(client, resolvedConversationId, userId);
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

  // ── Phase 2: knowledge search (no DB connection held) ────────────────────
  let { citations, chunks } = await searchApprovedKnowledge(message.trim(), departmentId);
  if (!citations.length) {
    await indexAllApprovedDocuments();
    ({ citations, chunks } = await searchApprovedKnowledge(message.trim(), departmentId));
  }

  onCitations(citations);

  // ── Phase 3: stream OpenAI tokens ────────────────────────────────────────
  const assistantText = await streamLlmResponse(message.trim(), chunks, citations, history, source, onToken);

  // ── Phase 4: save assistant message to DB ────────────────────────────────
  {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const assistantMsg = await client.query(
        `INSERT INTO chat_messages (conversation_id, role, source, content, metadata)
         VALUES ($1, 'assistant', 'text', $2, $3::jsonb)
         RETURNING id, role, source, content, metadata, created_at`,
        [
          resolvedConversationId,
          assistantText,
          JSON.stringify({
            citations: citations.map((c) => ({
              id: c.id, title: c.title, domain: c.domain,
              sourceType: c.source_type, department: c.department,
              excerpt: c.excerpt, score: c.score
            }))
          })
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
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
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
