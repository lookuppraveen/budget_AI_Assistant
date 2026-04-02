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
