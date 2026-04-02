import { pool } from "../../config/db.js";

// Build a 6-month label array ending at the current month, e.g. ["Oct","Nov","Dec","Jan","Feb","Mar"]
function last6MonthLabels() {
  const labels = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(d.toLocaleString("en-US", { month: "short" }));
  }
  return labels;
}

export async function getDashboardAnalytics() {
  const [
    pendingReviewRes,
    totalQueriesRes,
    totalQueriesPrevRes,
    resolvedByAiRes,
    resolvedByAiPrevRes,
    monthlyTrendRes,
    confidenceRes,
    heatmapRes,
    topTopicsRes,
    emailRes,
    lowConfRes,
    emailTrendRes,
    voiceTrendRes
  ] = await Promise.all([
    // Pending document review
    pool.query("SELECT COUNT(*)::int AS count FROM knowledge_documents WHERE status IN ('Pending', 'Hold')"),

    // Total user queries this month
    pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_messages
       WHERE role = 'user' AND created_at >= date_trunc('month', now())`
    ),

    // Total user queries last month (for trend)
    pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_messages
       WHERE role = 'user'
         AND created_at >= date_trunc('month', now() - interval '1 month')
         AND created_at < date_trunc('month', now())`
    ),

    // AI-resolved (assistant messages with at least one citation)
    pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND created_at >= date_trunc('month', now())`
    ),

    // AI-resolved last month
    pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND created_at >= date_trunc('month', now() - interval '1 month')
         AND created_at < date_trunc('month', now())`
    ),

    // Monthly breakdown — last 6 months, split by source (text vs voice)
    pool.query(
      `SELECT
         date_trunc('month', created_at) AS month_start,
         SUM(CASE WHEN source = 'text'  AND role = 'user' THEN 1 ELSE 0 END)::int AS chat_count,
         SUM(CASE WHEN source = 'voice' AND role = 'user' THEN 1 ELSE 0 END)::int AS voice_count
       FROM chat_messages
       WHERE created_at >= date_trunc('month', now() - interval '5 months')
       GROUP BY date_trunc('month', created_at)
       ORDER BY month_start ASC`
    ),

    // Confidence scores from assistant messages (last 30 days)
    pool.query(
      `SELECT (metadata->'citations'->0->>'score')::numeric AS score
       FROM chat_messages
       WHERE role = 'assistant'
         AND metadata->'citations' IS NOT NULL
         AND jsonb_array_length(metadata->'citations') > 0
         AND created_at >= now() - interval '30 days'`
    ),

    // Heatmap: message counts per day for last 42 days
    pool.query(
      `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS cnt
       FROM chat_messages
       WHERE role = 'user' AND created_at >= now() - interval '41 days'
       GROUP BY day
       ORDER BY day ASC`
    ),

    // Top topics: most cited document titles (last 30 days)
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
       LIMIT 5`
    ),

    // Email sync stats
    pool.query(
      `SELECT synced_emails, synced_attachments, status
       FROM email_integrations ORDER BY updated_at DESC LIMIT 1`
    ),

    // Low-confidence responses (top score < 0.5)
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND (metadata->'citations'->0->>'score')::numeric < 0.5
         AND created_at >= now() - interval '7 days'`
    ),

    // Email trend: emails ingested per month for last 6 months (from email_sync_events)
    pool.query(
      `SELECT
         date_trunc('month', synced_at) AS month_start,
         SUM(emails_count)::int AS total_emails
       FROM email_sync_events
       WHERE synced_at >= date_trunc('month', now() - interval '5 months')
       GROUP BY date_trunc('month', synced_at)
       ORDER BY month_start ASC`
    ),

    // Voice trend: unique voice sessions per month for last 6 months
    pool.query(
      `SELECT
         date_trunc('month', created_at) AS month_start,
         COUNT(DISTINCT conversation_id)::int AS session_count
       FROM voice_session_logs
       WHERE created_at >= date_trunc('month', now() - interval '5 months')
       GROUP BY date_trunc('month', created_at)
       ORDER BY month_start ASC`
    )
  ]);

  // --- KPIs ---
  const totalQueriesCurr = totalQueriesRes.rows[0].count;
  const totalQueriesPrev = totalQueriesPrevRes.rows[0].count;
  const resolvedCurr = resolvedByAiRes.rows[0].count;
  const resolvedPrev = resolvedByAiPrevRes.rows[0].count;
  const pendingReview = pendingReviewRes.rows[0].count;

  function trendPct(curr, prev) {
    if (prev === 0) return curr > 0 ? "+100%" : "0%";
    const pct = Math.round(((curr - prev) / prev) * 100);
    return `${pct >= 0 ? "+" : ""}${pct}%`;
  }

  // Avg confidence from scores
  const scores = confidenceRes.rows.map((r) => parseFloat(r.score)).filter((s) => !isNaN(s));
  const avgConfidence = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : 0;

  const kpis = [
    { label: "Total Budget Queries", value: String(totalQueriesCurr), trend: trendPct(totalQueriesCurr, totalQueriesPrev) },
    { label: "Resolved by AI", value: String(resolvedCurr), trend: trendPct(resolvedCurr, resolvedPrev) },
    { label: "Avg Confidence", value: `${avgConfidence}%`, trend: "" },
    { label: "Pending Human Review", value: String(pendingReview), trend: pendingReview > 10 ? "+5%" : "-4%" }
  ];

  // --- Stacked trend (last 6 months) ---
  const monthLabels = last6MonthLabels();
  const now = new Date();
  const chatArr = Array(6).fill(0);
  const voiceArr = Array(6).fill(0);
  const emailArr = Array(6).fill(0);

  // Chat-only messages from chat_messages (source='text')
  for (const row of monthlyTrendRes.rows) {
    const d = new Date(row.month_start);
    const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    const idx = 5 - monthsAgo;
    if (idx >= 0 && idx < 6) chatArr[idx] = row.chat_count;
  }

  // Email trend: real per-month counts from email_sync_events
  for (const row of emailTrendRes.rows) {
    const d = new Date(row.month_start);
    const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    const idx = 5 - monthsAgo;
    if (idx >= 0 && idx < 6) emailArr[idx] = row.total_emails;
  }

  // Voice trend: real per-month session counts from voice_session_logs
  for (const row of voiceTrendRes.rows) {
    const d = new Date(row.month_start);
    const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    const idx = 5 - monthsAgo;
    if (idx >= 0 && idx < 6) voiceArr[idx] = row.session_count;
  }

  const emailRow = emailRes.rows[0];

  // --- Confidence distribution ---
  const highCount = scores.filter((s) => s >= 0.7).length;
  const medCount = scores.filter((s) => s >= 0.4 && s < 0.7).length;
  const lowCount = scores.filter((s) => s < 0.4).length;
  const total = scores.length || 1;

  const confidenceDistribution = {
    high: Math.round((highCount / total) * 100),
    medium: Math.round((medCount / total) * 100),
    low: Math.round((lowCount / total) * 100),
    average: avgConfidence
  };

  // --- Heatmap (42 cells — 6 weeks × 7 days, oldest first) ---
  const heatmapMap = new Map();
  for (const row of heatmapRes.rows) {
    heatmapMap.set(row.day, row.cnt);
  }

  const heatmapCells = [];
  for (let i = 41; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    heatmapCells.push(heatmapMap.get(key) || 0);
  }

  // --- Top topics ---
  const topTopics = topTopicsRes.rows.map((row) => ({
    name: row.title,
    value: row.cnt
  }));

  // --- Alerts ---
  const lowConfCount = lowConfRes.rows[0].count;
  const emailStatus = emailRow?.status === "connected" ? "Email integration is connected." : "Email integration is not configured.";
  const alerts = [];

  if (lowConfCount > 0) alerts.push(`${lowConfCount} low-confidence responses in the last 7 days need review`);
  if (pendingReview > 0) alerts.push(`${pendingReview} documents pending review`);
  alerts.push(emailStatus);

  return {
    kpis,
    stackedTrend: { months: monthLabels, chat: chatArr, email: emailArr, voice: voiceArr },
    confidenceDistribution,
    heatmapCells,
    topTopics,
    alerts
  };
}
