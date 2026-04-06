import cron from "node-cron";
import * as XLSX from "xlsx";
import { pool } from "../../config/db.js";
import { sendMail } from "../../utils/mailer.js";

// In-memory map of reportId → active cron task
const scheduledJobs = new Map();

export async function listReports() {
  const result = await pool.query(
    `SELECT id, report_name, owner, frequency, status, schedule_cron, last_run_at, created_at, updated_at
     FROM report_runs
     ORDER BY created_at DESC`
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.report_name,
    owner: row.owner,
    frequency: row.frequency,
    status: row.status,
    scheduleCron: row.schedule_cron,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function createReport({ reportName, owner, frequency }, currentUserId) {
  // Resolve owner name — fall back to provided string if not a UUID
  let resolvedOwner = owner;
  try {
    const userRes = await pool.query("SELECT name FROM users WHERE id = $1", [currentUserId]);
    if (userRes.rowCount > 0) {
      resolvedOwner = userRes.rows[0].name;
    }
  } catch {
    // non-fatal
  }

  const result = await pool.query(
    `INSERT INTO report_runs (report_name, owner, frequency, status)
     VALUES ($1, $2, $3, 'Draft')
     RETURNING id, report_name, owner, frequency, status, created_at, updated_at`,
    [reportName.trim(), resolvedOwner || owner, frequency]
  );

  return {
    id: result.rows[0].id,
    name: result.rows[0].report_name,
    owner: result.rows[0].owner,
    frequency: result.rows[0].frequency,
    status: result.rows[0].status,
    createdAt: result.rows[0].created_at,
    updatedAt: result.rows[0].updated_at
  };
}

export async function scheduleReport(reportId, { scheduleCron }) {
  if (!cron.validate(scheduleCron)) {
    const error = new Error("Invalid cron expression");
    error.statusCode = 400;
    throw error;
  }

  const result = await pool.query(
    `UPDATE report_runs
     SET schedule_cron = $1, status = 'Scheduled', updated_at = now()
     WHERE id = $2
     RETURNING id, report_name, status, schedule_cron`,
    [scheduleCron, reportId]
  );

  if (result.rowCount === 0) {
    const error = new Error("Report not found");
    error.statusCode = 404;
    throw error;
  }

  // Register / replace the live cron job
  registerCronJob(reportId, scheduleCron);

  return result.rows[0];
}

function registerCronJob(reportId, scheduleCron) {
  // Cancel existing job for this report if any
  const existing = scheduledJobs.get(reportId);
  if (existing) existing.stop();

  const task = cron.schedule(scheduleCron, async () => {
    console.log(`[report-scheduler] Running scheduled report ${reportId}`);
    try {
      await runReport(reportId);
    } catch (err) {
      console.error(`[report-scheduler] Report ${reportId} failed:`, err.message);
      await pool.query(
        `UPDATE report_runs SET status = 'Failed', updated_at = now() WHERE id = $1`,
        [reportId]
      ).catch(() => {});
    }
  });

  scheduledJobs.set(reportId, task);
}

/**
 * Load all Scheduled reports from DB and register cron jobs.
 * Called once on server startup.
 */
export async function startReportScheduler() {
  try {
    const result = await pool.query(
      `SELECT id, schedule_cron FROM report_runs
       WHERE status = 'Scheduled' AND schedule_cron IS NOT NULL`
    );

    for (const row of result.rows) {
      if (cron.validate(row.schedule_cron)) {
        registerCronJob(row.id, row.schedule_cron);
      }
    }

    console.log(`[report-scheduler] Loaded ${result.rowCount} scheduled report(s)`);
  } catch (err) {
    console.error("[report-scheduler] Failed to load scheduled reports:", err.message);
  }
}

export async function runReport(reportId, notifyEmail) {
  // Verify the report exists
  const reportRes = await pool.query(
    "SELECT id, report_name, owner, frequency FROM report_runs WHERE id = $1",
    [reportId]
  );

  if (reportRes.rowCount === 0) {
    const error = new Error("Report not found");
    error.statusCode = 404;
    throw error;
  }

  const report = reportRes.rows[0];

  // Gather real stats to store as output
  const [
    totalQueriesRes,
    resolvedQueriesRes,
    pendingDocsRes,
    approvedDocsRes,
    totalDeptsRes,
    deptsWithDocsRes,
    avgConfRes,
    topSourceRes
  ] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_messages
       WHERE role = 'user' AND created_at >= now() - interval '30 days'`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND created_at >= now() - interval '30 days'`
    ),
    pool.query(`SELECT COUNT(*)::int AS count FROM knowledge_documents WHERE status IN ('Pending','Hold')`),
    pool.query(`SELECT COUNT(*)::int AS count FROM knowledge_documents WHERE status = 'Approved'`),
    pool.query(`SELECT COUNT(*)::int AS count FROM departments`),
    pool.query(
      `SELECT COUNT(DISTINCT department_id)::int AS count FROM knowledge_documents WHERE status = 'Approved'`
    ),
    pool.query(
      `SELECT ROUND(AVG((metadata->'citations'->0->>'score')::numeric) * 100)::int AS avg_pct
       FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND created_at >= now() - interval '30 days'`
    ),
    pool.query(
      `SELECT jsonb_array_elements(metadata->'citations')->>'title' AS title, COUNT(*)::int AS cnt
       FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND created_at >= now() - interval '30 days'
       GROUP BY title ORDER BY cnt DESC LIMIT 5`
    )
  ]);

  const totalQueries = totalQueriesRes.rows[0].count;
  const resolvedQueries = resolvedQueriesRes.rows[0].count;
  const pendingDocs = pendingDocsRes.rows[0].count;
  const approvedDocs = approvedDocsRes.rows[0].count;
  const totalDepts = totalDeptsRes.rows[0].count;
  const deptsWithDocs = deptsWithDocsRes.rows[0].count;
  const avgConf = avgConfRes.rows[0]?.avg_pct ?? 0;
  const topSources = topSourceRes.rows.map((r) => ({ title: r.title, count: r.cnt }));

  const aiResolutionRate = totalQueries > 0 ? Math.round((resolvedQueries / totalQueries) * 100) : 0;
  const knowledgeCoverage = totalDepts > 0 ? Math.round((deptsWithDocs / totalDepts) * 100) : 0;

  const output = {
    generatedAt: new Date().toISOString(),
    reportName: report.report_name,
    period: "Last 30 days",
    summary: {
      totalQueries,
      resolvedByAi: resolvedQueries,
      aiResolutionRate: `${aiResolutionRate}%`,
      avgConfidence: `${avgConf}%`,
      approvedDocuments: approvedDocs,
      pendingDocuments: pendingDocs,
      knowledgeCoverage: `${knowledgeCoverage}%`
    },
    topCitedSources: topSources,
    sla: [
      { metric: "AI Resolution Rate", actual: `${aiResolutionRate}%`, target: "75%", met: aiResolutionRate >= 75 },
      { metric: "Knowledge Coverage", actual: `${knowledgeCoverage}%`, target: "85%", met: knowledgeCoverage >= 85 },
      { metric: "Avg Confidence", actual: `${avgConf}%`, target: "70%", met: avgConf >= 70 }
    ]
  };

  const updated = await pool.query(
    `UPDATE report_runs
     SET status = 'Ready', output = $1::jsonb, last_run_at = now(), updated_at = now()
     WHERE id = $2
     RETURNING id, report_name, owner, frequency, status, last_run_at, output`,
    [JSON.stringify(output), reportId]
  );

  const runResult = {
    id: updated.rows[0].id,
    name: updated.rows[0].report_name,
    owner: updated.rows[0].owner,
    frequency: updated.rows[0].frequency,
    status: updated.rows[0].status,
    lastRunAt: updated.rows[0].last_run_at,
    output: updated.rows[0].output
  };

  // Send email notification — non-fatal
  if (notifyEmail) {
    const slaRows = output.sla?.map((s) => {
      const icon = s.met ? "✓" : "✗";
      return `<tr><td>${s.metric}</td><td>${s.actual}</td><td>${s.target}</td><td>${icon} ${s.met ? "Met" : "Missed"}</td></tr>`;
    }).join("") || "";

    const html = `
      <h2>Report Ready: ${output.reportName}</h2>
      <p>Your scheduled report has completed for the period: <strong>${output.period}</strong>.</p>
      <h3>Summary</h3>
      <ul>
        <li>Total Queries: ${output.summary.totalQueries}</li>
        <li>AI Resolution Rate: ${output.summary.aiResolutionRate}</li>
        <li>Avg Confidence: ${output.summary.avgConfidence}</li>
        <li>Knowledge Coverage: ${output.summary.knowledgeCoverage}</li>
        <li>Approved Documents: ${output.summary.approvedDocuments}</li>
      </ul>
      ${slaRows ? `<h3>SLA</h3><table border="1" cellpadding="6"><tr><th>Metric</th><th>Actual</th><th>Target</th><th>Status</th></tr>${slaRows}</table>` : ""}
      <p><em>Generated at ${new Date(output.generatedAt).toLocaleString()}</em></p>
    `;

    sendMail({ to: notifyEmail, subject: `Report Ready: ${output.reportName}`, html }).catch((err) => {
      console.error("[runReport] notification email failed:", err.message);
    });
  }

  return runResult;
}

export async function exportExecutivePack() {
  // Gather all Ready reports with their output
  const readyRes = await pool.query(
    `SELECT id, report_name, owner, frequency, last_run_at, output
     FROM report_runs
     WHERE status = 'Ready'
     ORDER BY last_run_at DESC NULLS LAST`
  );

  if (readyRes.rowCount === 0) {
    const error = new Error("No Ready reports available to export. Run at least one report first.");
    error.statusCode = 422;
    throw error;
  }

  const lines = [
    "BUDGET AI ASSISTANT — EXECUTIVE PACK",
    `Generated: ${new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}`,
    "=".repeat(60),
    ""
  ];

  for (const row of readyRes.rows) {
    const out = row.output || {};
    lines.push(`REPORT: ${row.report_name}`);
    lines.push(`Owner: ${row.owner}  |  Frequency: ${row.frequency}`);
    if (row.last_run_at) {
      lines.push(`Last Run: ${new Date(row.last_run_at).toLocaleString()}`);
    }
    lines.push("-".repeat(40));

    if (out.summary) {
      lines.push("Summary:");
      for (const [key, val] of Object.entries(out.summary)) {
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
        lines.push(`  ${label}: ${val}`);
      }
    }

    if (out.sla?.length) {
      lines.push("SLA:");
      for (const s of out.sla) {
        const met = s.met ? "✓ MET" : "✗ MISSED";
        lines.push(`  ${s.metric}: ${s.actual} (target ${s.target}) — ${met}`);
      }
    }

    if (out.topCitedSources?.length) {
      lines.push("Top Cited Sources:");
      for (const s of out.topCitedSources) {
        lines.push(`  ${s.title} (${s.count} citations)`);
      }
    }

    lines.push("");
  }

  lines.push("=".repeat(60));
  lines.push("End of Executive Pack");

  return lines.join("\n");
}

export async function exportReportsExcel() {
  const readyRes = await pool.query(
    `SELECT id, report_name, owner, frequency, last_run_at, output
     FROM report_runs
     WHERE status = 'Ready'
     ORDER BY last_run_at DESC NULLS LAST`
  );

  if (readyRes.rowCount === 0) {
    const error = new Error("No Ready reports available to export. Run at least one report first.");
    error.statusCode = 422;
    throw error;
  }

  const wb = XLSX.utils.book_new();

  // Sheet 1: Reports overview
  const overviewRows = readyRes.rows.map((row) => ({
    "Report Name": row.report_name,
    Owner: row.owner || "",
    Frequency: row.frequency || "",
    "Last Run": row.last_run_at ? new Date(row.last_run_at).toLocaleString() : ""
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows), "Reports");

  // Sheet 2: Summary metrics (flatten first Ready report or all)
  const summaryRows = [];
  for (const row of readyRes.rows) {
    const out = row.output || {};
    if (out.summary) {
      for (const [key, val] of Object.entries(out.summary)) {
        summaryRows.push({ Report: row.report_name, Metric: key, Value: val });
      }
    }
  }
  if (summaryRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Metrics");
  }

  // Sheet 3: SLA
  const slaRows = [];
  for (const row of readyRes.rows) {
    const out = row.output || {};
    if (out.sla?.length) {
      for (const s of out.sla) {
        slaRows.push({ Report: row.report_name, Metric: s.metric, Actual: s.actual, Target: s.target, Met: s.met ? "Yes" : "No" });
      }
    }
  }
  if (slaRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(slaRows), "SLA");
  }

  // Sheet 4: Top cited sources
  const sourceRows = [];
  for (const row of readyRes.rows) {
    const out = row.output || {};
    if (out.topCitedSources?.length) {
      for (const s of out.topCitedSources) {
        sourceRows.push({ Report: row.report_name, Source: s.title, Citations: s.count });
      }
    }
  }
  if (sourceRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sourceRows), "Top Sources");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export async function getReportsSummary() {
  const [
    statusResult,
    departmentDocStats,
    totalReportsRes,
    readyReportsRes,
    totalDeptsRes,
    deptsWithApprovedDocRes,
    totalAssistantRes,
    resolvedAssistantRes,
    recentRunsRes,
    monthlyRunsRes
  ] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS count FROM report_runs GROUP BY status`),
    pool.query(
      `SELECT d.name AS department, COUNT(kd.id)::int AS total
       FROM departments d
       LEFT JOIN knowledge_documents kd ON kd.department_id = d.id
       GROUP BY d.name
       ORDER BY d.name ASC`
    ),
    pool.query(`SELECT COUNT(*)::int AS count FROM report_runs`),
    pool.query(`SELECT COUNT(*)::int AS count FROM report_runs WHERE status = 'Ready'`),
    pool.query(`SELECT COUNT(*)::int AS count FROM departments`),
    pool.query(
      `SELECT COUNT(DISTINCT department_id)::int AS count
       FROM knowledge_documents WHERE status = 'Approved'`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_messages
       WHERE role = 'assistant' AND created_at >= now() - interval '30 days'`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_messages
       WHERE role = 'assistant'
         AND jsonb_array_length(metadata->'citations') > 0
         AND created_at >= now() - interval '30 days'`
    ),
    pool.query(
      `SELECT report_name, status, updated_at FROM report_runs ORDER BY updated_at DESC LIMIT 4`
    ),
    pool.query(
      `SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
              date_trunc('month', created_at) AS month_start,
              COUNT(*)::int AS count
       FROM report_runs
       WHERE created_at >= date_trunc('month', now()) - interval '5 months'
       GROUP BY month_start, month
       ORDER BY month_start ASC`
    )
  ]);

  const statusMap = { Ready: 0, Draft: 0, Scheduled: 0, Failed: 0 };
  for (const row of statusResult.rows) {
    if (Object.prototype.hasOwnProperty.call(statusMap, row.status)) {
      statusMap[row.status] = row.count;
    }
  }

  const totalReports = totalReportsRes.rows[0].count;
  const readyReports = readyReportsRes.rows[0].count;
  const reportReadinessPct = totalReports > 0 ? Math.round((readyReports / totalReports) * 100) : 0;

  const totalDepts = totalDeptsRes.rows[0].count;
  const deptsWithDocs = deptsWithApprovedDocRes.rows[0].count;
  const knowledgeCoveragePct = totalDepts > 0 ? Math.round((deptsWithDocs / totalDepts) * 100) : 0;

  const totalAssistant = totalAssistantRes.rows[0].count;
  const resolvedAssistant = resolvedAssistantRes.rows[0].count;
  const aiResolutionPct = totalAssistant > 0 ? Math.round((resolvedAssistant / totalAssistant) * 100) : 0;

  const slaMetrics = [
    { label: "Report Readiness", actual: reportReadinessPct, target: 80 },
    { label: "Knowledge Coverage", actual: knowledgeCoveragePct, target: 85 },
    { label: "AI Resolution Rate", actual: aiResolutionPct, target: 75 }
  ];

  const completenessMatrix = departmentDocStats.rows.map((row) => {
    const t = row.total;
    return {
      dept: row.department,
      values: [
        Math.min(4, Math.max(0, t)),
        Math.min(4, Math.max(0, t - 1)),
        Math.min(4, Math.max(0, t - 2)),
        Math.min(4, Math.max(0, t - 1))
      ]
    };
  });

  function mapRunToStage(status, index) {
    if (status === "Failed") return "error";
    if (status === "Ready") return "done";
    if (index === 0) return "active";
    return "upcoming";
  }

  const runs = recentRunsRes.rows.reverse();
  const timeline = runs.map((run, index) => {
    const d = new Date(run.updated_at);
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    return { time, title: run.report_name, stage: mapRunToStage(run.status, index) };
  });

  if (timeline.length === 0) {
    timeline.push({ time: "—", title: "No reports generated yet", stage: "upcoming" });
  }

  // Build last-6-months array, filling zeros for months with no reports
  const now = new Date();
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const label = d.toLocaleString("en-US", { month: "short" });
    const match = monthlyRunsRes.rows.find((r) => {
      const rd = new Date(r.month_start);
      return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth();
    });
    return { label, count: match ? match.count : 0 };
  });

  return { status: statusMap, slaMetrics, matrixCols: ["Policies", "Procedures", "History", "Training"], completenessMatrix, timeline, monthly };
}
