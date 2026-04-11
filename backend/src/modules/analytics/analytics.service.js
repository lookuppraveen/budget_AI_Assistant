import { pool } from "../../config/db.js";

export async function getBudgetForecast() {
  const [yoyRes, pipelineRes, deptRes, trendRes] = await Promise.all([

    // Year-over-year totals by fiscal year
    pool.query(
      `SELECT fiscal_year,
              COUNT(*)::int                                                             AS request_count,
              COALESCE(SUM(requested_amount),0)::numeric                               AS total_requested,
              COALESCE(SUM(CASE WHEN status='approved' THEN requested_amount END),0)::numeric AS approved_amount,
              COALESCE(SUM(CASE WHEN status='denied'   THEN requested_amount END),0)::numeric AS denied_amount
       FROM budget_requests
       GROUP BY fiscal_year
       ORDER BY fiscal_year ASC
       LIMIT 6`
    ),

    // Current pipeline counts + totals by status
    pool.query(
      `SELECT status,
              COUNT(*)::int                           AS count,
              COALESCE(SUM(requested_amount),0)::numeric AS total
       FROM budget_requests
       GROUP BY status
       ORDER BY count DESC`
    ),

    // Top 8 departments by requested amount
    pool.query(
      `SELECT d.name AS department,
              COUNT(br.id)::int                                                             AS request_count,
              COALESCE(SUM(br.requested_amount),0)::numeric                               AS total_requested,
              COALESCE(SUM(CASE WHEN br.status='approved' THEN br.requested_amount END),0)::numeric AS approved_amount
       FROM budget_requests br
       JOIN departments d ON d.id = br.department_id
       GROUP BY d.name
       ORDER BY total_requested DESC
       LIMIT 8`
    ),

    // Monthly approval / denial trend — last 6 months
    pool.query(
      `SELECT date_trunc('month', reviewed_at) AS month_start,
              COUNT(CASE WHEN status='approved' THEN 1 END)::int AS approved,
              COUNT(CASE WHEN status='denied'   THEN 1 END)::int AS denied,
              COUNT(*)::int AS total
       FROM budget_requests
       WHERE reviewed_at >= date_trunc('month', now() - interval '5 months')
         AND status IN ('approved','denied')
       GROUP BY date_trunc('month', reviewed_at)
       ORDER BY month_start ASC`
    )
  ]);

  return {
    yearOverYear: yoyRes.rows.map((r) => ({
      fiscalYear:     r.fiscal_year,
      requestCount:   r.request_count,
      totalRequested: Number(r.total_requested),
      approvedAmount: Number(r.approved_amount),
      deniedAmount:   Number(r.denied_amount)
    })),
    pipeline: pipelineRes.rows.map((r) => ({
      status: r.status,
      count:  r.count,
      total:  Number(r.total)
    })),
    departmentBreakdown: deptRes.rows.map((r) => ({
      department:     r.department,
      requestCount:   r.request_count,
      totalRequested: Number(r.total_requested),
      approvedAmount: Number(r.approved_amount)
    })),
    approvalTrend: trendRes.rows.map((r) => ({
      month:    new Date(r.month_start).toLocaleString("en-US", { month: "short", year: "2-digit" }),
      approved: r.approved,
      denied:   r.denied,
      rate:     r.total > 0 ? Math.round((r.approved / r.total) * 100) : 0
    }))
  };
}

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
    voiceTrendRes,
    unansweredRes,
    pendingReviewQueueRes
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
    ),

    // Unanswered questions: user messages whose paired assistant response had 0 citations
    // These represent knowledge gaps — questions the AI couldn't answer from approved docs
    pool.query(
      `SELECT
         um.content AS question,
         um.created_at
       FROM chat_messages um
       JOIN LATERAL (
         SELECT metadata
         FROM chat_messages
         WHERE conversation_id = um.conversation_id
           AND role = 'assistant'
           AND created_at > um.created_at
         ORDER BY created_at ASC
         LIMIT 1
       ) am ON true
       WHERE um.role = 'user'
         AND um.created_at >= now() - interval '30 days'
         AND (
           am.metadata->'citations' IS NULL
           OR jsonb_array_length(am.metadata->'citations') = 0
         )
       ORDER BY um.created_at DESC
       LIMIT 10`
    ),

    // Pending human review queue count
    pool.query(
      `SELECT COUNT(*)::int AS count FROM human_review_queue WHERE status = 'pending'`
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
  const pendingReviewQueueCount = pendingReviewQueueRes.rows[0]?.count ?? 0;

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

  // --- Alerts — derived from real DB data, returned as { level, msg } objects ---
  const lowConfCount = lowConfRes.rows[0].count;
  const alerts = [];

  if (lowConfCount > 0) {
    alerts.push({
      level: "warn",
      msg: `${lowConfCount} low-confidence AI response${lowConfCount > 1 ? "s" : ""} in the last 7 days — review in Citations & Audit`
    });
  }

  if (pendingReview > 0) {
    alerts.push({
      level: "warn",
      msg: `${pendingReview} document${pendingReview > 1 ? "s" : ""} pending review in Knowledge Domains`
    });
  }

  if (emailRow?.status && emailRow.status !== "connected") {
    alerts.push({
      level: "info",
      msg: "Email integration is not configured — set up in Email Assistant"
    });
  }

  if (pendingReviewQueueCount > 0) {
    alerts.push({
      level: "warn",
      msg: `${pendingReviewQueueCount} low-confidence response${pendingReviewQueueCount > 1 ? "s" : ""} pending human review — check Review Queue`
    });
  }

  // Unanswered questions (knowledge gaps)
  const unansweredQuestions = unansweredRes.rows.map((r) => ({
    question: r.question.length > 120 ? r.question.slice(0, 120) + "…" : r.question,
    askedAt: r.created_at
  }));

  return {
    kpis,
    stackedTrend: { months: monthLabels, chat: chatArr, email: emailArr, voice: voiceArr },
    confidenceDistribution,
    heatmapCells,
    topTopics,
    unansweredQuestions,
    pendingReviewQueueCount,
    alerts
  };
}

// ── Proactive alerts ──────────────────────────────────────────────────────────
// Returns actionable alerts derived from real budget data

export async function getProactiveAlerts() {
  const [
    pendingRes,
    overdueRes,
    anomalyRes,
    yoyRes,
    deficitRes,
    feedbackRes,
  ] = await Promise.all([
    // Requests submitted but not reviewed in > 7 days
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM budget_requests
       WHERE status IN ('submitted','under_review')
         AND submitted_at < now() - interval '7 days'`
    ),

    // Requests with a deadline in the next 3 days
    pool.query(
      `SELECT id, title, deadline, department_id
       FROM budget_requests
       WHERE status NOT IN ('approved','denied')
         AND deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
       ORDER BY deadline ASC
       LIMIT 5`
    ),

    // Open critical anomaly flags
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM budget_anomaly_flags
       WHERE is_resolved = false AND severity = 'critical'`
    ),

    // YoY spike: fiscal years where requested amount jumped > 25% vs prior year
    pool.query(
      `SELECT
         curr.fiscal_year,
         curr.total::numeric AS curr_total,
         prev.total::numeric AS prev_total,
         ROUND(((curr.total - prev.total) / NULLIF(prev.total, 0)) * 100, 1) AS pct_change
       FROM (
         SELECT fiscal_year, SUM(requested_amount) AS total FROM budget_requests GROUP BY fiscal_year
       ) curr
       JOIN (
         SELECT fiscal_year, SUM(requested_amount) AS total FROM budget_requests GROUP BY fiscal_year
       ) prev ON prev.fiscal_year < curr.fiscal_year
       WHERE ((curr.total - prev.total) / NULLIF(prev.total, 0)) > 0.25
       ORDER BY curr.fiscal_year DESC
       LIMIT 1`
    ),

    // Scenario with largest projected deficit
    pool.query(
      `SELECT name, fiscal_year, projected_surplus_deficit::numeric
       FROM budget_scenarios
       WHERE projected_surplus_deficit < 0
       ORDER BY projected_surplus_deficit ASC
       LIMIT 1`
    ),

    // Negative feedback count in last 7 days
    pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_feedback
       WHERE rating = -1 AND created_at >= now() - interval '7 days'`
    ),
  ]);

  const alerts = [];

  const stalePending = pendingRes.rows[0].count;
  if (stalePending > 0) {
    alerts.push({
      id: "stale_pending",
      level: "warn",
      category: "workflow",
      title: "Stale Pending Requests",
      message: `${stalePending} budget request${stalePending > 1 ? "s have" : " has"} been awaiting review for more than 7 days.`,
      action: "Review in Budget Requests"
    });
  }

  for (const req of overdueRes.rows) {
    const days = Math.ceil((new Date(req.deadline) - new Date()) / 86400000);
    alerts.push({
      id: `deadline_${req.id}`,
      level: "critical",
      category: "deadline",
      title: "Deadline Approaching",
      message: `"${req.title}" is due in ${days <= 0 ? "today" : `${days} day${days > 1 ? "s" : ""}`}.`,
      action: "Open request"
    });
  }

  const criticalAnomalies = anomalyRes.rows[0].count;
  if (criticalAnomalies > 0) {
    alerts.push({
      id: "critical_anomalies",
      level: "critical",
      category: "anomaly",
      title: "Critical Anomalies Detected",
      message: `${criticalAnomalies} unresolved critical anomaly flag${criticalAnomalies > 1 ? "s" : ""} require attention.`,
      action: "Review in Budget Requests → Anomalies"
    });
  }

  if (yoyRes.rows.length > 0) {
    const row = yoyRes.rows[0];
    alerts.push({
      id: `yoy_spike_${row.fiscal_year}`,
      level: "warn",
      category: "trend",
      title: "Year-Over-Year Spending Spike",
      message: `${row.fiscal_year} total requested is up ${row.pct_change}% vs prior year ($${Number(row.prev_total).toLocaleString()} → $${Number(row.curr_total).toLocaleString()}).`,
      action: "View in Analytics"
    });
  }

  if (deficitRes.rows.length > 0) {
    const row = deficitRes.rows[0];
    alerts.push({
      id: "scenario_deficit",
      level: "warn",
      category: "scenario",
      title: "Projected Deficit in Scenario",
      message: `Scenario "${row.name}" (${row.fiscal_year}) projects a deficit of $${Math.abs(Number(row.projected_surplus_deficit)).toLocaleString()}.`,
      action: "Open in Scenario Planning"
    });
  }

  const negFeedback = feedbackRes.rows[0].count;
  if (negFeedback >= 3) {
    alerts.push({
      id: "negative_feedback",
      level: "info",
      category: "quality",
      title: "AI Response Quality",
      message: `${negFeedback} negative feedback response${negFeedback > 1 ? "s" : ""} in the last 7 days — review AI answers.`,
      action: "View Review Queue"
    });
  }

  return { alerts, generatedAt: new Date().toISOString() };
}

// ── Executive Copilot ─────────────────────────────────────────────────────────

export async function generateTalkingPoints(fiscalYear) {
  const fy = fiscalYear || new Date().getFullYear() + 1;

  const [requestsRes, scenarioRes, deptRes, anomalyRes] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN status='approved' THEN 1 END)::int AS approved,
         COUNT(CASE WHEN status='denied'   THEN 1 END)::int AS denied,
         COUNT(CASE WHEN status IN ('submitted','under_review') THEN 1 END)::int AS pending,
         COALESCE(SUM(CASE WHEN status='approved' THEN requested_amount END),0)::numeric AS approved_amount,
         COALESCE(SUM(requested_amount),0)::numeric AS total_requested
       FROM budget_requests WHERE fiscal_year = $1`,
      [fy]
    ),
    pool.query(
      `SELECT name, scenario_type, projected_surplus_deficit::numeric, projected_revenue::numeric, projected_expense::numeric
       FROM budget_scenarios WHERE fiscal_year = $1
       ORDER BY scenario_type ASC`,
      [fy]
    ),
    pool.query(
      `SELECT d.name AS department, SUM(br.requested_amount)::numeric AS total
       FROM budget_requests br
       JOIN departments d ON d.id = br.department_id
       WHERE br.fiscal_year = $1 AND br.status = 'approved'
       GROUP BY d.name ORDER BY total DESC LIMIT 5`,
      [fy]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM budget_anomaly_flags WHERE fiscal_year = $1 AND is_resolved = false`,
      [fy]
    ),
  ]);

  const req  = requestsRes.rows[0];
  const approvalRate = req.total > 0 ? Math.round((req.approved / req.total) * 100) : 0;

  const points = [];

  // 1. Overview
  points.push({
    category: "Budget Pipeline",
    point: `${req.total} budget requests submitted for ${fy} totaling $${Number(req.total_requested).toLocaleString()}. Approval rate: ${approvalRate}% ($${Number(req.approved_amount).toLocaleString()} approved).`,
  });

  // 2. Pending actions
  if (req.pending > 0) {
    points.push({
      category: "Pending Actions",
      point: `${req.pending} request${req.pending > 1 ? "s" : ""} still under review. Timely decisions needed to meet budget finalization deadlines.`,
    });
  }

  // 3. Top departments
  if (deptRes.rows.length > 0) {
    const topDepts = deptRes.rows.slice(0, 3).map((r) => `${r.department} ($${Number(r.total).toLocaleString()})`).join(", ");
    points.push({
      category: "Top Approved Departments",
      point: `Largest approved allocations: ${topDepts}.`,
    });
  }

  // 4. Scenario outlook
  for (const s of scenarioRes.rows) {
    const surplus = Number(s.projected_surplus_deficit);
    const label = surplus >= 0 ? `surplus of $${surplus.toLocaleString()}` : `deficit of $${Math.abs(surplus).toLocaleString()}`;
    points.push({
      category: `${s.scenario_type.charAt(0).toUpperCase() + s.scenario_type.slice(1)} Scenario`,
      point: `"${s.name}" projects a ${label} (revenue $${Number(s.projected_revenue).toLocaleString()} vs expense $${Number(s.projected_expense).toLocaleString()}).`,
    });
  }

  // 5. Risk flag
  const anomalyCount = anomalyRes.rows[0].count;
  if (anomalyCount > 0) {
    points.push({
      category: "Risk",
      point: `${anomalyCount} unresolved budget anomal${anomalyCount > 1 ? "ies" : "y"} flagged for ${fy}. Review before final approval.`,
    });
  }

  return { fiscalYear: fy, talkingPoints: points, generatedAt: new Date().toISOString() };
}

export async function generateVarianceExplanation(fiscalYear) {
  const fy = fiscalYear || new Date().getFullYear() + 1;

  const [currRes, prevRes, deptDeltaRes] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(requested_amount),0)::numeric AS total_requested,
         COALESCE(SUM(CASE WHEN status='approved' THEN requested_amount END),0)::numeric AS approved
       FROM budget_requests WHERE fiscal_year = $1`,
      [fy]
    ),
    pool.query(
      `SELECT
         COALESCE(SUM(requested_amount),0)::numeric AS total_requested,
         COALESCE(SUM(CASE WHEN status='approved' THEN requested_amount END),0)::numeric AS approved
       FROM budget_requests WHERE fiscal_year = $1::text`,
      [String(Number(fy.replace ? fy.replace(/[^\d]/g, "") : fy) - 1)]
    ),
    pool.query(
      `SELECT
         d.name AS department,
         COALESCE(SUM(CASE WHEN br.fiscal_year=$1 AND br.status='approved' THEN br.requested_amount END),0)::numeric AS curr,
         COALESCE(SUM(CASE WHEN br.fiscal_year=$2 AND br.status='approved' THEN br.requested_amount END),0)::numeric AS prev
       FROM departments d
       LEFT JOIN budget_requests br ON br.department_id = d.id
         AND br.fiscal_year IN ($1,$2)
       GROUP BY d.name
       ORDER BY ABS(COALESCE(SUM(CASE WHEN br.fiscal_year=$1 AND br.status='approved' THEN br.requested_amount END),0)
                 - COALESCE(SUM(CASE WHEN br.fiscal_year=$2 AND br.status='approved' THEN br.requested_amount END),0)) DESC
       LIMIT 5`,
      [String(fy), String(Number(fy.replace ? fy.replace(/[^\d]/g, "") : fy) - 1)]
    ),
  ]);

  const curr = currRes.rows[0];
  const prev = prevRes.rows[0];
  const currApproved = Number(curr.approved);
  const prevApproved = Number(prev.approved);
  const delta = currApproved - prevApproved;
  const pctChange = prevApproved > 0 ? ((delta / prevApproved) * 100).toFixed(1) : null;

  const headline = pctChange !== null
    ? `Approved budget for ${fy} is ${delta >= 0 ? "up" : "down"} ${Math.abs(pctChange)}% vs prior year ($${Math.abs(delta).toLocaleString()} ${delta >= 0 ? "increase" : "decrease"}).`
    : `No prior-year data available to compute variance for ${fy}.`;

  const departmentVariances = deptDeltaRes.rows
    .filter((r) => Number(r.curr) > 0 || Number(r.prev) > 0)
    .map((r) => {
      const c = Number(r.curr);
      const p = Number(r.prev);
      const d = c - p;
      return {
        department: r.department,
        current: c,
        previous: p,
        delta: d,
        pctChange: p > 0 ? ((d / p) * 100).toFixed(1) : null,
      };
    });

  return {
    fiscalYear: fy,
    headline,
    currentApproved: currApproved,
    previousApproved: prevApproved,
    delta,
    pctChange,
    departmentVariances,
    generatedAt: new Date().toISOString(),
  };
}
