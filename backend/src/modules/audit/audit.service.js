import { pool } from "../../config/db.js";

export async function getAuditLogs({ limit = 50, offset = 0, action, entityType } = {}) {
  const filters = [];
  const values = [];

  if (action) {
    values.push(action);
    filters.push(`al.action = $${values.length}`);
  }

  if (entityType) {
    values.push(entityType);
    filters.push(`al.entity_type = $${values.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  values.push(limit, offset);

  const [logsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT al.id, al.action, al.entity_type, al.entity_id,
              al.user_email, al.user_role, al.details, al.ip_address, al.created_at
       FROM audit_logs al
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs al ${where}`,
      values.slice(0, -2)
    )
  ]);

  return { logs: logsResult.rows, total: countResult.rows[0].total };
}

/**
 * Returns drill-down rows for a given metric box.
 * type: top-domain | risky-answers | top-source | coverage-gaps | avg-confidence | resolution-rate
 */
export async function getMetricDetail(type) {
  switch (type) {

    case "top-domain": {
      // All domains ranked by citation count in last 30 days
      const res = await pool.query(
        `SELECT
           jsonb_array_elements(metadata->'citations')->>'domain' AS domain,
           COUNT(*)::int                                          AS times_cited,
           COUNT(DISTINCT jsonb_array_elements(metadata->'citations')->>'title')::int AS unique_docs,
           MAX(created_at)                                        AS last_cited
         FROM chat_messages
         WHERE role = 'assistant'
           AND jsonb_array_length(metadata->'citations') > 0
           AND created_at >= now() - interval '30 days'
         GROUP BY domain
         ORDER BY times_cited DESC
         LIMIT 15`
      );
      return {
        title: "Top Cited Knowledge Domains (Last 30 Days)",
        description: "How often each knowledge domain was cited in AI responses. A high count means users are frequently asking questions that draw on that domain's approved documents.",
        columns: ["Domain", "Times Cited", "Unique Documents", "Last Cited"],
        rows: res.rows.map((r) => [
          r.domain,
          r.times_cited,
          r.unique_docs,
          new Date(r.last_cited).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        ])
      };
    }

    case "risky-answers": {
      // Low-confidence assistant responses in last 7 days
      const res = await pool.query(
        `SELECT
           cm.created_at,
           prev.content                               AS user_query,
           (cm.metadata->'citations'->0->>'score')::numeric AS score,
           cm.metadata->'citations'->0->>'title'     AS top_source
         FROM chat_messages cm
         LEFT JOIN LATERAL (
           SELECT content FROM chat_messages
           WHERE conversation_id = cm.conversation_id
             AND role = 'user'
             AND created_at < cm.created_at
           ORDER BY created_at DESC LIMIT 1
         ) prev ON true
         WHERE cm.role = 'assistant'
           AND jsonb_array_length(cm.metadata->'citations') > 0
           AND (cm.metadata->'citations'->0->>'score')::numeric < 0.5
           AND cm.created_at >= now() - interval '7 days'
         ORDER BY score ASC
         LIMIT 20`
      );
      return {
        title: "Risky Answers This Week",
        description: "AI responses where the top citation confidence score was below 50%. Low confidence means the answer may not be well-supported by approved documents — these may need human review or additional document approvals.",
        columns: ["Time", "User Question", "Confidence", "Top Source Used"],
        rows: res.rows.map((r) => [
          new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
          r.user_query ? r.user_query.slice(0, 80) + (r.user_query.length > 80 ? "…" : "") : "—",
          r.score ? `${(r.score * 100).toFixed(0)}%` : "—",
          r.top_source || "—"
        ])
      };
    }

    case "top-source": {
      // Most cited document titles in last 30 days
      const res = await pool.query(
        `SELECT
           jsonb_array_elements(metadata->'citations')->>'title'  AS title,
           jsonb_array_elements(metadata->'citations')->>'domain' AS domain,
           COUNT(*)::int                                          AS times_cited,
           ROUND(AVG((jsonb_array_elements(metadata->'citations')->>'score')::numeric) * 100)::int AS avg_score_pct,
           MAX(created_at)                                        AS last_cited
         FROM chat_messages
         WHERE role = 'assistant'
           AND jsonb_array_length(metadata->'citations') > 0
           AND created_at >= now() - interval '30 days'
         GROUP BY title, domain
         ORDER BY times_cited DESC
         LIMIT 15`
      );
      return {
        title: "Most Cited Documents (Last 30 Days)",
        description: "Individual documents ranked by how many times they appeared as a source in AI responses. These are the most relied-upon references in your knowledge base.",
        columns: ["Document Title", "Domain", "Times Cited", "Avg Confidence"],
        rows: res.rows.map((r) => [
          r.title ? r.title.slice(0, 60) + (r.title.length > 60 ? "…" : "") : "—",
          r.domain || "—",
          r.times_cited,
          `${r.avg_score_pct ?? 0}%`
        ])
      };
    }

    case "coverage-gaps": {
      // All domains with their approval status breakdown
      const res = await pool.query(
        `SELECT
           domain,
           COUNT(*)::int                                              AS total,
           COUNT(*) FILTER (WHERE status = 'Approved')::int          AS approved,
           COUNT(*) FILTER (WHERE status = 'Pending')::int           AS pending,
           COUNT(*) FILTER (WHERE status IN ('Rejected','Hold'))::int AS rejected
         FROM knowledge_documents
         GROUP BY domain
         ORDER BY approved ASC, total DESC`
      );
      return {
        title: "Knowledge Coverage by Domain",
        description: "Domains where approved documents are missing or limited. When a domain has zero approved documents, the AI cannot answer questions in that area with citations — it will respond with a knowledge gap message.",
        columns: ["Domain", "Total Docs", "Approved", "Pending Review", "Rejected/Hold"],
        rows: res.rows.map((r) => [
          r.domain,
          r.total,
          r.approved,
          r.pending,
          r.rejected
        ])
      };
    }

    case "avg-confidence": {
      // Daily avg confidence score over last 30 days
      const res = await pool.query(
        `SELECT
           DATE(created_at)                                                                 AS day,
           COUNT(*)::int                                                                    AS queries,
           ROUND(AVG((metadata->'citations'->0->>'score')::numeric) * 100)::int            AS avg_pct,
           COUNT(*) FILTER (WHERE (metadata->'citations'->0->>'score')::numeric >= 0.7)::int AS high_conf,
           COUNT(*) FILTER (WHERE (metadata->'citations'->0->>'score')::numeric < 0.5)::int  AS low_conf
         FROM chat_messages
         WHERE role = 'assistant'
           AND jsonb_array_length(metadata->'citations') > 0
           AND created_at >= now() - interval '30 days'
         GROUP BY day
         ORDER BY day DESC
         LIMIT 30`
      );
      return {
        title: "Daily Answer Confidence (Last 30 Days)",
        description: "The average confidence score of AI responses each day. Confidence reflects how closely the approved documents matched the user's question. Higher is better — a score above 70% means strong knowledge coverage.",
        columns: ["Date", "AI Responses", "Avg Confidence", "High Confidence (≥70%)", "Low Confidence (<50%)"],
        rows: res.rows.map((r) => [
          new Date(r.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          r.queries,
          `${r.avg_pct ?? 0}%`,
          r.high_conf,
          r.low_conf
        ])
      };
    }

    case "resolution-rate": {
      // Daily resolution rate over last 7 days
      const res = await pool.query(
        `SELECT
           DATE(created_at) AS day,
           COUNT(*) FILTER (WHERE role = 'user')::int       AS user_queries,
           COUNT(*) FILTER (WHERE role = 'assistant'
             AND jsonb_array_length(metadata->'citations') > 0)::int AS answered,
           COUNT(*) FILTER (WHERE role = 'assistant'
             AND (metadata->'citations' IS NULL
               OR jsonb_array_length(metadata->'citations') = 0))::int AS unanswered
         FROM chat_messages
         WHERE created_at >= now() - interval '7 days'
         GROUP BY day
         ORDER BY day DESC`
      );
      return {
        title: "AI Resolution Rate (Last 7 Days)",
        description: "How many user questions the AI was able to answer with source citations vs questions where no relevant approved documents were found. A low resolution rate means you need more approved documents in the knowledge base.",
        columns: ["Date", "User Questions", "Answered with Citations", "No Citations Found", "Resolution Rate"],
        rows: res.rows.map((r) => {
          const rate = r.user_queries > 0 ? Math.round((r.answered / r.user_queries) * 100) : 0;
          return [
            new Date(r.day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
            r.user_queries,
            r.answered,
            r.unanswered,
            `${rate}%`
          ];
        })
      };
    }

    default:
      throw Object.assign(new Error("Unknown metric type"), { statusCode: 400 });
  }
}

export async function getAuditMetrics() {
  const [
    topDomainRes,
    riskyAnswersRes,
    topSourceRes,
    coverageGapsRes,
    totalQueriesRes,
    citedQueriesRes,
    lowConfAvgRes
  ] = await Promise.all([
    // Most cited knowledge domain in the last 30 days
    pool.query(
      `SELECT
         jsonb_array_elements(metadata->'citations')->>'domain' AS domain,
         COUNT(*)::int AS cnt
       FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND created_at >= now() - interval '30 days'
       GROUP BY domain
       ORDER BY cnt DESC
       LIMIT 1`
    ),

    // Count of assistant messages with a low top-citation score in the last 7 days
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND (metadata->'citations'->0->>'score')::numeric < 0.5
         AND created_at >= now() - interval '7 days'`
    ),

    // Most cited document title in the last 30 days
    pool.query(
      `SELECT
         jsonb_array_elements(metadata->'citations')->>'title' AS title,
         COUNT(*)::int AS cnt
       FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND created_at >= now() - interval '30 days'
       GROUP BY title
       ORDER BY cnt DESC
       LIMIT 1`
    ),

    // Knowledge domains with ZERO approved documents
    pool.query(
      `SELECT DISTINCT domain
       FROM knowledge_documents
       WHERE domain NOT IN (
         SELECT DISTINCT domain FROM knowledge_documents WHERE status = 'Approved'
       )
       ORDER BY domain ASC
       LIMIT 3`
    ),

    // Total user queries last 7 days
    pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_messages
       WHERE role = 'user' AND created_at >= now() - interval '7 days'`
    ),

    // Queries answered with citations last 7 days
    pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND created_at >= now() - interval '7 days'`
    ),

    // Average confidence score over last 30 days
    pool.query(
      `SELECT ROUND(AVG((metadata->'citations'->0->>'score')::numeric) * 100)::int AS avg_pct
       FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND created_at >= now() - interval '30 days'`
    )
  ]);

  const topDomain = topDomainRes.rows[0]?.domain || "No data yet";
  const riskyAnswers = riskyAnswersRes.rows[0].count;
  const topSource = topSourceRes.rows[0]?.title || "No citations yet";
  const avgConfidence = lowConfAvgRes.rows[0]?.avg_pct ?? 0;

  const gapList = coverageGapsRes.rows.map((r) => r.domain);
  const coverageGaps = gapList.length > 0 ? gapList.join(", ") : "None — all domains have approved docs";

  const totalQueries = totalQueriesRes.rows[0].count;
  const citedQueries = citedQueriesRes.rows[0].count;
  const resolutionRate = totalQueries > 0 ? Math.round((citedQueries / totalQueries) * 100) : 0;

  return [
    { label: "Top Cited Domain (30d)", value: topDomain },
    { label: "Risky Answers This Week", value: riskyAnswers > 0 ? `${riskyAnswers} flagged` : "None" },
    { label: "Most Used Source (30d)", value: topSource },
    { label: "Coverage Gaps", value: coverageGaps },
    { label: "Avg Confidence (30d)", value: `${avgConfidence}%` },
    { label: "AI Resolution Rate (7d)", value: `${resolutionRate}%` }
  ];
}
