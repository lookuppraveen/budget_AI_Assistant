import OpenAI from "openai";
import * as XLSX from "xlsx";
import { pool } from "../../config/db.js";
import { env } from "../../config/env.js";
import { notifyRequestSubmitted, notifyRequestReviewed } from "./budget-notifications.service.js";
import { autoLogBudgetDecision } from "../decision-log/decision-log.service.js";

let openAiClient = null;
function getOpenAi() {
  if (!openAiClient) openAiClient = new OpenAI({ apiKey: env.openAiApiKey });
  return openAiClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function toRequest(row) {
  return {
    id:                 row.id,
    title:              row.title,
    fiscalYear:         row.fiscal_year,
    fundType:           row.fund_type,
    expenseCategory:    row.expense_category,
    requestType:        row.request_type,
    costType:           row.cost_type,
    baseBudgetAmount:   Number(row.base_budget_amount),
    requestedAmount:    Number(row.requested_amount),
    recurringAmount:    Number(row.recurring_amount),
    oneTimeAmount:      Number(row.one_time_amount),
    justification:      row.justification,
    strategicAlignment: row.strategic_alignment,
    impactDescription:  row.impact_description,
    status:             row.status,
    priority:           row.priority,
    aiSummary:          row.ai_summary,
    aiClassifiedType:   row.ai_classified_type,
    aiMissingFields:    row.ai_missing_fields || [],
    aiConfidence:       row.ai_confidence ? Number(row.ai_confidence) : null,
    analyzedAt:         row.analyzed_at,
    assignedTo:         row.assigned_to,
    assignedToName:     row.assigned_to_name,
    reviewerNotes:      row.reviewer_notes,
    reviewedBy:         row.reviewed_by,
    reviewedByName:     row.reviewed_by_name,
    reviewedAt:         row.reviewed_at,
    decisionRationale:  row.decision_rationale,
    riskFlag:           row.risk_flag,
    riskReason:         row.risk_reason,
    deadline:           row.deadline,
    submittedAt:        row.submitted_at,
    submittedBy:        row.submitted_by,
    submittedByName:    row.submitted_by_name,
    departmentId:       row.department_id,
    departmentName:     row.department_name,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at
  };
}

const REQUEST_SELECT = `
  br.id, br.title, br.fiscal_year, br.fund_type, br.expense_category,
  br.request_type, br.cost_type, br.base_budget_amount, br.requested_amount,
  br.recurring_amount, br.one_time_amount, br.justification, br.strategic_alignment,
  br.impact_description, br.status, br.priority, br.ai_summary, br.ai_classified_type,
  br.ai_missing_fields, br.ai_confidence, br.analyzed_at,
  br.assigned_to, au.name AS assigned_to_name,
  br.reviewer_notes, br.reviewed_by, ru.name AS reviewed_by_name, br.reviewed_at,
  br.decision_rationale, br.risk_flag, br.risk_reason, br.deadline, br.submitted_at,
  br.submitted_by, su.name AS submitted_by_name,
  br.department_id, d.name AS department_name,
  br.created_at, br.updated_at
FROM budget_requests br
JOIN departments d  ON d.id  = br.department_id
JOIN users su       ON su.id = br.submitted_by
LEFT JOIN users au  ON au.id = br.assigned_to
LEFT JOIN users ru  ON ru.id = br.reviewed_by
`;

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listBudgetRequests({ status, fiscalYear, departmentId, priority, limit = 50, offset = 0 } = {}, user) {
  const filters = [];
  const values = [];

  // Dept Editors only see their own department's requests
  if (user.role === "Department Editor" && user.departmentId) {
    values.push(user.departmentId);
    filters.push(`br.department_id = $${values.length}`);
  } else if (departmentId) {
    values.push(departmentId);
    filters.push(`br.department_id = $${values.length}`);
  }

  if (status && status !== "all") {
    values.push(status);
    filters.push(`br.status = $${values.length}`);
  }

  if (fiscalYear) {
    values.push(fiscalYear);
    filters.push(`br.fiscal_year = $${values.length}`);
  }

  if (priority) {
    values.push(priority);
    filters.push(`br.priority = $${values.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  values.push(limit, offset);

  const [rows, countRes] = await Promise.all([
    pool.query(`SELECT ${REQUEST_SELECT} ${where} ORDER BY br.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values),
    pool.query(`SELECT COUNT(*)::int AS total FROM budget_requests br ${where}`, values.slice(0, -2))
  ]);

  return { requests: rows.rows.map(toRequest), total: countRes.rows[0].total };
}

export async function getBudgetRequest(id, user) {
  const res = await pool.query(`SELECT ${REQUEST_SELECT} WHERE br.id = $1`, [id]);
  if (res.rowCount === 0) throw Object.assign(new Error("Budget request not found"), { statusCode: 404 });

  const req = res.rows[0];
  // Dept Editors can only view their own dept
  if (user.role === "Department Editor" && req.department_id !== user.departmentId) {
    throw Object.assign(new Error("Access denied"), { statusCode: 403 });
  }

  const [scores, validations, anomalies] = await Promise.all([
    pool.query(
      `SELECT brs.criteria_key, bsc.label, bsc.weight, brs.raw_score, brs.weighted_score, brs.rationale, brs.scored_by, brs.scored_at
       FROM budget_request_scores brs
       JOIN budget_scoring_criteria bsc ON bsc.key = brs.criteria_key
       WHERE brs.request_id = $1 ORDER BY bsc.label ASC`, [id]
    ),
    pool.query(
      `SELECT rule_key, rule_label, severity, message, passed, checked_at
       FROM budget_request_validations WHERE request_id = $1 ORDER BY severity DESC, rule_label ASC`, [id]
    ),
    pool.query(
      `SELECT flag_type, severity, description, details, is_resolved, created_at
       FROM budget_anomaly_flags WHERE request_id = $1 ORDER BY created_at DESC`, [id]
    )
  ]);

  return {
    ...toRequest(req),
    scores: scores.rows,
    validations: validations.rows,
    anomalies: anomalies.rows
  };
}

export async function createBudgetRequest(payload, user) {
  const dept = await pool.query(
    `SELECT id FROM departments WHERE id = $1`,
    [user.departmentId]
  );
  if (!dept.rowCount) throw Object.assign(new Error("User has no department assigned"), { statusCode: 400 });

  const res = await pool.query(
    `INSERT INTO budget_requests (
       submitted_by, department_id, title, fiscal_year, fund_type, expense_category,
       request_type, cost_type, base_budget_amount, requested_amount,
       recurring_amount, one_time_amount, justification, strategic_alignment,
       impact_description, deadline
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [
      user.id, user.departmentId, payload.title, payload.fiscalYear,
      payload.fundType || null, payload.expenseCategory || null,
      payload.requestType, payload.costType,
      payload.baseBudgetAmount, payload.requestedAmount,
      payload.recurringAmount, payload.oneTimeAmount,
      payload.justification, payload.strategicAlignment || null,
      payload.impactDescription || null,
      payload.deadline || null
    ]
  );

  return getBudgetRequest(res.rows[0].id, user);
}

export async function updateBudgetRequest(id, payload, user) {
  const existing = await pool.query(`SELECT status, submitted_by, department_id FROM budget_requests WHERE id = $1`, [id]);
  if (!existing.rowCount) throw Object.assign(new Error("Budget request not found"), { statusCode: 404 });

  const req = existing.rows[0];

  // Only submitter can edit draft; analysts/admin can edit under_review
  if (user.role === "Department Editor") {
    if (req.submitted_by !== user.id) throw Object.assign(new Error("Access denied"), { statusCode: 403 });
    if (!["draft", "on_hold"].includes(req.status)) throw Object.assign(new Error("Cannot edit a submitted request"), { statusCode: 400 });
  }

  const fields = [];
  const values = [];
  const map = {
    title: "title", fiscalYear: "fiscal_year", fundType: "fund_type",
    expenseCategory: "expense_category", requestType: "request_type",
    costType: "cost_type", baseBudgetAmount: "base_budget_amount",
    requestedAmount: "requested_amount", recurringAmount: "recurring_amount",
    oneTimeAmount: "one_time_amount", justification: "justification",
    strategicAlignment: "strategic_alignment", impactDescription: "impact_description",
    deadline: "deadline"
  };

  for (const [jsKey, dbCol] of Object.entries(map)) {
    if (payload[jsKey] !== undefined) {
      values.push(payload[jsKey]);
      fields.push(`${dbCol} = $${values.length}`);
    }
  }

  if (!fields.length) throw Object.assign(new Error("No fields to update"), { statusCode: 400 });

  values.push(id);
  await pool.query(`UPDATE budget_requests SET ${fields.join(", ")}, updated_at = now() WHERE id = $${values.length}`, values);

  return getBudgetRequest(id, user);
}

export async function submitBudgetRequest(id, user) {
  const res = await pool.query(`SELECT status, submitted_by FROM budget_requests WHERE id = $1`, [id]);
  if (!res.rowCount) throw Object.assign(new Error("Budget request not found"), { statusCode: 404 });

  const req = res.rows[0];
  if (req.submitted_by !== user.id && !["Admin", "Budget Analyst"].includes(user.role)) {
    throw Object.assign(new Error("Access denied"), { statusCode: 403 });
  }
  if (!["draft", "on_hold"].includes(req.status)) {
    throw Object.assign(new Error("Only draft or on-hold requests can be submitted"), { statusCode: 400 });
  }

  await pool.query(
    `UPDATE budget_requests SET status = 'submitted', submitted_at = now(), updated_at = now() WHERE id = $1`, [id]
  );

  // Trigger analysis asynchronously (non-blocking)
  analyzeRequest(id).catch((err) => console.error(`Analysis failed for request ${id}:`, err.message));

  // Notify reviewers asynchronously (non-blocking)
  notifyRequestSubmitted(id).catch((err) => console.error(`Notification failed for request ${id}:`, err.message));

  return getBudgetRequest(id, user);
}

export async function reviewBudgetRequest(id, payload, reviewerId) {
  const res = await pool.query(`SELECT status, title, fiscal_year FROM budget_requests WHERE id = $1`, [id]);
  if (!res.rowCount) throw Object.assign(new Error("Budget request not found"), { statusCode: 404 });

  const updates = [`status = $1`, `reviewed_by = $2`, `reviewed_at = now()`, `updated_at = now()`];
  const values  = [payload.status, reviewerId];

  if (payload.reviewerNotes) { values.push(payload.reviewerNotes); updates.push(`reviewer_notes = $${values.length}`); }
  if (payload.decisionRationale) { values.push(payload.decisionRationale); updates.push(`decision_rationale = $${values.length}`); }
  if (payload.priority) { values.push(payload.priority); updates.push(`priority = $${values.length}`); }
  if (payload.assignedTo) { values.push(payload.assignedTo); updates.push(`assigned_to = $${values.length}`); }

  values.push(id);
  await pool.query(`UPDATE budget_requests SET ${updates.join(", ")} WHERE id = $${values.length}`, values);

  // Auto-log to decision_log when status is a terminal decision
  if (["approved", "denied", "on_hold"].includes(payload.status)) {
    const row = res.rows[0];
    autoLogBudgetDecision({
      requestId:    id,
      requestTitle: row.title,
      decision:     `Request ${payload.status}: ${row.title}`,
      rationale:    payload.decisionRationale || payload.reviewerNotes || null,
      fiscalYear:   row.fiscal_year,
      decidedById:  reviewerId,
    });
  }

  // Notify submitter asynchronously (non-blocking)
  notifyRequestReviewed(id, payload.status).catch((err) => console.error(`Review notification failed for ${id}:`, err.message));

  const fakeUser = { role: "Admin" };
  return getBudgetRequest(id, fakeUser);
}

export async function deleteBudgetRequest(id, user) {
  const res = await pool.query(`SELECT status, submitted_by FROM budget_requests WHERE id = $1`, [id]);
  if (!res.rowCount) throw Object.assign(new Error("Budget request not found"), { statusCode: 404 });

  const req = res.rows[0];
  if (user.role !== "Admin" && req.submitted_by !== user.id) {
    throw Object.assign(new Error("Access denied"), { statusCode: 403 });
  }
  if (!["draft", "denied"].includes(req.status) && user.role !== "Admin") {
    throw Object.assign(new Error("Only draft or denied requests can be deleted"), { statusCode: 400 });
  }

  await pool.query(`DELETE FROM budget_requests WHERE id = $1`, [id]);
  return { deleted: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM ANALYSIS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export async function analyzeRequest(requestId) {
  const res = await pool.query(
    `SELECT br.*, d.name AS department_name
     FROM budget_requests br JOIN departments d ON d.id = br.department_id
     WHERE br.id = $1`, [requestId]
  );
  if (!res.rowCount) return;
  const req = res.rows[0];

  const analysisPrompt = `You are a budget analyst AI. Analyze this budget request and return a JSON object ONLY (no prose, no markdown fences).

BUDGET REQUEST:
Title: ${req.title}
Department: ${req.department_name}
Fiscal Year: ${req.fiscal_year}
Request Type: ${req.request_type}
Cost Type: ${req.cost_type}
Requested Amount: $${Number(req.requested_amount).toLocaleString()}
Base Budget: $${Number(req.base_budget_amount).toLocaleString()}
Expense Category: ${req.expense_category || "Not specified"}
Justification: ${req.justification}
Strategic Alignment: ${req.strategic_alignment || "Not provided"}
Impact Description: ${req.impact_description || "Not provided"}

Return this exact JSON structure:
{
  "classifiedType": "operational|capital|staffing|grant|other",
  "costType": "one-time|recurring|mixed",
  "summary": "2-3 sentence plain English summary of what is being requested and why",
  "missingFields": ["array of field names that are missing or vague, e.g. 'strategic_alignment', 'impact_description', 'justification_detail'"],
  "confidence": 0.85,
  "scores": {
    "strategic_alignment": {"score": 7, "rationale": "..."},
    "student_impact": {"score": 6, "rationale": "..."},
    "mandatory_flag": {"score": 4, "rationale": "..."},
    "operational_risk": {"score": 5, "rationale": "..."},
    "return_on_investment": {"score": 6, "rationale": "..."},
    "compliance_need": {"score": 3, "rationale": "..."},
    "equity_access": {"score": 5, "rationale": "..."}
  },
  "riskFlag": "none|low|medium|high|critical",
  "riskReason": "brief explanation or null"
}
All score values are integers 0–10. confidence is 0.0–1.0.`;

  let analysis = null;

  if (env.openAiApiKey) {
    try {
      const completion = await getOpenAi().chat.completions.create({
        model: env.openAiChatModel,
        messages: [{ role: "user", content: analysisPrompt }],
        temperature: 0.2,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });
      analysis = JSON.parse(completion.choices[0].message.content);
    } catch (err) {
      console.error("LLM analysis failed:", err.message);
    }
  }

  // Fallback heuristic analysis when OpenAI unavailable
  if (!analysis) {
    analysis = buildHeuristicAnalysis(req);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Save AI classification back to request
    await client.query(
      `UPDATE budget_requests
       SET ai_summary = $1, ai_classified_type = $2, ai_missing_fields = $3,
           ai_confidence = $4, risk_flag = $5, risk_reason = $6, analyzed_at = now(), updated_at = now()
       WHERE id = $7`,
      [
        analysis.summary,
        analysis.classifiedType,
        analysis.missingFields || [],
        analysis.confidence ?? 0.5,
        analysis.riskFlag || "none",
        analysis.riskReason || null,
        requestId
      ]
    );

    // Load criteria weights
    const criteriaRes = await client.query(
      `SELECT key, weight FROM budget_scoring_criteria WHERE is_active = true`
    );
    const weightMap = new Map(criteriaRes.rows.map((r) => [r.key, Number(r.weight)]));

    // Upsert scores
    if (analysis.scores && typeof analysis.scores === "object") {
      for (const [key, val] of Object.entries(analysis.scores)) {
        const weight  = weightMap.get(key) ?? 0.143;
        const raw     = Math.min(10, Math.max(0, Number(val.score) || 0));
        const weighted = (raw * weight) / 10;

        await client.query(
          `INSERT INTO budget_request_scores (request_id, criteria_key, raw_score, weighted_score, rationale, scored_by)
           VALUES ($1, $2, $3, $4, $5, 'ai')
           ON CONFLICT (request_id, criteria_key)
           DO UPDATE SET raw_score = EXCLUDED.raw_score, weighted_score = EXCLUDED.weighted_score,
                         rationale = EXCLUDED.rationale, scored_at = now()`,
          [requestId, key, raw, weighted, val.rationale || null]
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Run rules engine and anomaly detection after analysis
  await runRulesEngine(requestId);
  await detectAnomalies(requestId);
}

function buildHeuristicAnalysis(req) {
  const missingFields = [];
  if (!req.strategic_alignment) missingFields.push("strategic_alignment");
  if (!req.impact_description)  missingFields.push("impact_description");
  if (req.justification.length < 100) missingFields.push("justification_detail");

  const amount = Number(req.requested_amount);
  const riskFlag = amount > 500000 ? "high" : amount > 100000 ? "medium" : amount > 25000 ? "low" : "none";

  return {
    classifiedType: req.request_type,
    costType: req.cost_type,
    summary: `${req.department_name} is requesting $${amount.toLocaleString()} for ${req.title} in ${req.fiscal_year}. Review justification and strategic alignment for completeness.`,
    missingFields,
    confidence: 0.4,
    scores: {
      strategic_alignment:  { score: req.strategic_alignment ? 6 : 3,  rationale: req.strategic_alignment ? "Alignment provided" : "No alignment stated" },
      student_impact:       { score: 5, rationale: "Insufficient information to assess student impact" },
      mandatory_flag:       { score: req.request_type === "grant" ? 7 : 4, rationale: "Classification suggests discretionary" },
      operational_risk:     { score: riskFlag === "high" ? 7 : 4, rationale: "Risk assessed from amount" },
      return_on_investment:  { score: 5, rationale: "ROI not described in request" },
      compliance_need:      { score: 3, rationale: "No compliance requirement noted" },
      equity_access:        { score: req.impact_description ? 5 : 3, rationale: "Impact description partially provided" }
    },
    riskFlag,
    riskReason: riskFlag !== "none" ? `Requested amount $${amount.toLocaleString()} triggers risk threshold` : null
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DECISION RULES ENGINE
// ─────────────────────────────────────────────────────────────────────────────

const RULES = [
  {
    key: "has_justification",
    label: "Justification Provided",
    severity: "error",
    check: (r) => r.justification && r.justification.trim().length >= 50,
    message: "Justification must be at least 50 characters."
  },
  {
    key: "has_strategic_alignment",
    label: "Strategic Alignment Stated",
    severity: "warning",
    check: (r) => Boolean(r.strategic_alignment && r.strategic_alignment.trim().length > 10),
    message: "Strategic alignment is missing. Budget requests are stronger when tied to institutional priorities."
  },
  {
    key: "has_impact_description",
    label: "Impact Description Provided",
    severity: "warning",
    check: (r) => Boolean(r.impact_description && r.impact_description.trim().length > 10),
    message: "No impact description provided. Explain who benefits and how."
  },
  {
    key: "amount_not_zero",
    label: "Requested Amount > 0",
    severity: "error",
    check: (r) => Number(r.requested_amount) > 0,
    message: "Requested amount must be greater than zero."
  },
  {
    key: "capital_threshold",
    label: "Large Capital Request Flag",
    severity: "warning",
    check: (r) => !(r.request_type === "capital" && Number(r.requested_amount) > 250000),
    message: "Capital requests over $250,000 require cabinet-level review before submission."
  },
  {
    key: "recurring_breakdown",
    label: "Recurring/One-Time Breakdown",
    severity: "info",
    check: (r) => r.cost_type === "one-time" || (Number(r.recurring_amount) > 0 || Number(r.one_time_amount) > 0),
    message: "For mixed or recurring costs, provide a recurring vs one-time breakdown."
  },
  {
    key: "fiscal_year_set",
    label: "Fiscal Year Specified",
    severity: "error",
    check: (r) => Boolean(r.fiscal_year),
    message: "Fiscal year is required."
  },
  {
    key: "staffing_category",
    label: "Staffing Requests Categorized",
    severity: "warning",
    check: (r) => !(r.request_type === "staffing" && r.expense_category !== "Personnel"),
    message: "Staffing requests should use the 'Personnel' expense category."
  },
  {
    key: "extreme_amount_flag",
    label: "Extreme Amount Threshold",
    severity: "error",
    check: (r) => Number(r.requested_amount) <= 5000000,
    message: "Requests over $5,000,000 require board-level approval and must be submitted through the capital planning process."
  }
];

export async function runRulesEngine(requestId) {
  const res = await pool.query(`SELECT * FROM budget_requests WHERE id = $1`, [requestId]);
  if (!res.rowCount) return;
  const req = res.rows[0];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const rule of RULES) {
      let passed = false;
      try { passed = Boolean(rule.check(req)); } catch { passed = false; }

      await client.query(
        `INSERT INTO budget_request_validations (request_id, rule_key, rule_label, severity, message, passed)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (request_id, rule_key)
         DO UPDATE SET passed = EXCLUDED.passed, message = EXCLUDED.message, checked_at = now()`,
        [requestId, rule.key, rule.label, rule.severity, rule.message, passed]
      );
    }

    // If any error-level rules failed, flag the request as high risk
    const failedErrors = RULES.filter((r) => r.severity === "error" && !r.check(req));
    if (failedErrors.length > 0) {
      await client.query(
        `UPDATE budget_requests SET risk_flag = 'high', risk_reason = $1, updated_at = now() WHERE id = $2 AND (risk_flag IS NULL OR risk_flag IN ('none','low'))`,
        [`Failed validation rules: ${failedErrors.map((r) => r.label).join(", ")}`, requestId]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANOMALY DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export async function detectAnomalies(requestId) {
  const res = await pool.query(
    `SELECT br.*, d.name AS department_name FROM budget_requests br JOIN departments d ON d.id = br.department_id WHERE br.id = $1`, [requestId]
  );
  if (!res.rowCount) return;
  const req = res.rows[0];
  const amount = Number(req.requested_amount);

  const flagsToInsert = [];

  // 1. Year-over-year increase detection
  // Find previous fiscal year request for same department and request type
  const prevFy = req.fiscal_year.replace(/(\d+)$/, (m) => String(Number(m) - 1));
  const prevRes = await pool.query(
    `SELECT requested_amount FROM budget_requests
     WHERE department_id = $1 AND fiscal_year = $2 AND request_type = $3 AND status != 'denied'
     ORDER BY created_at DESC LIMIT 1`,
    [req.department_id, prevFy, req.request_type]
  );
  if (prevRes.rowCount > 0) {
    const prevAmount = Number(prevRes.rows[0].requested_amount);
    if (prevAmount > 0) {
      const pctIncrease = ((amount - prevAmount) / prevAmount) * 100;
      if (pctIncrease > 30) {
        flagsToInsert.push({
          flag_type: "yoy_increase",
          severity: pctIncrease > 75 ? "critical" : "warning",
          description: `${pctIncrease.toFixed(0)}% increase over ${prevFy} request for same department and type`,
          details: { prevAmount, currentAmount: amount, pctIncrease: pctIncrease.toFixed(1), prevFiscalYear: prevFy }
        });
      }
    }
  }

  // 2. Duplicate detection — similar title or very close amount in same dept/FY
  const dupeRes = await pool.query(
    `SELECT id, title, requested_amount FROM budget_requests
     WHERE department_id = $1 AND fiscal_year = $2 AND id != $3 AND status != 'denied'
       AND (
         similarity(lower(title), lower($4)) > 0.4
         OR ABS(requested_amount - $5) < (requested_amount * 0.05)
       )
     LIMIT 3`,
    [req.department_id, req.fiscal_year, requestId, req.title, amount]
  ).catch(() => ({ rows: [] })); // graceful fallback if pg_trgm not installed

  if (dupeRes.rows.length > 0) {
    flagsToInsert.push({
      flag_type: "duplicate_request",
      severity: "warning",
      description: `Possible duplicate: ${dupeRes.rows.length} similar request(s) found in ${req.fiscal_year} for this department`,
      details: { similarRequests: dupeRes.rows.map((r) => ({ id: r.id, title: r.title, amount: Number(r.requested_amount) })) }
    });
  }

  // 3. Department norm check — compare to average request amount for this dept
  const normRes = await pool.query(
    `SELECT AVG(requested_amount)::numeric AS avg_amount, STDDEV(requested_amount)::numeric AS stddev_amount
     FROM budget_requests
     WHERE department_id = $1 AND id != $2 AND status != 'denied'`,
    [req.department_id, requestId]
  );
  if (normRes.rowCount > 0 && normRes.rows[0].avg_amount) {
    const avg    = Number(normRes.rows[0].avg_amount);
    const stddev = Number(normRes.rows[0].stddev_amount) || avg * 0.5;
    if (amount > avg + 2.5 * stddev) {
      flagsToInsert.push({
        flag_type: "exceeds_dept_norm",
        severity: "warning",
        description: `Requested amount $${amount.toLocaleString()} is significantly above department average ($${avg.toFixed(0)})`,
        details: { avgAmount: avg.toFixed(0), stddev: stddev.toFixed(0), requestedAmount: amount }
      });
    }
  }

  // 4. Salary anomaly — staffing requests > $200K per FTE (rough check)
  if (req.request_type === "staffing" && req.expense_category === "Personnel" && amount > 200000) {
    flagsToInsert.push({
      flag_type: "salary_anomaly",
      severity: "info",
      description: `Staffing request of $${amount.toLocaleString()} exceeds typical single-position threshold — verify FTE count`,
      details: { requestedAmount: amount }
    });
  }

  if (flagsToInsert.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const flag of flagsToInsert) {
      await client.query(
        `INSERT INTO budget_anomaly_flags (request_id, department_id, fiscal_year, flag_type, severity, description, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT DO NOTHING`,
        [requestId, req.department_id, req.fiscal_year, flag.flag_type, flag.severity, flag.description, JSON.stringify(flag.details)]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    // Anomaly detection failure should not crash the request flow
    console.error("Anomaly detection insert failed:", err.message);
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING CRITERIA MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function getScoringCriteria() {
  const res = await pool.query(
    `SELECT id, key, label, description, weight, is_active, created_at, updated_at
     FROM budget_scoring_criteria ORDER BY label ASC`
  );
  return res.rows;
}

export async function updateScoringCriteria(criteriaUpdates) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const c of criteriaUpdates) {
      const updates = [];
      const values  = [];
      if (c.weight !== undefined)   { values.push(c.weight);   updates.push(`weight = $${values.length}`); }
      if (c.isActive !== undefined) { values.push(c.isActive); updates.push(`is_active = $${values.length}`); }
      if (!updates.length) continue;
      values.push(c.key);
      await client.query(
        `UPDATE budget_scoring_criteria SET ${updates.join(", ")}, updated_at = now() WHERE key = $${values.length}`,
        values
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getScoringCriteria();
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY GENERATION (Dean-level & Cabinet briefings)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateRequestsSummary({ fiscalYear, departmentId, audienceLevel = "analyst" }) {
  const filters = [`br.status NOT IN ('draft')`];
  const values  = [];

  if (fiscalYear)    { values.push(fiscalYear);    filters.push(`br.fiscal_year = $${values.length}`); }
  if (departmentId)  { values.push(departmentId);  filters.push(`br.department_id = $${values.length}`); }

  const where = `WHERE ${filters.join(" AND ")}`;

  const [reqRes, scoreRes] = await Promise.all([
    pool.query(
      `SELECT br.title, br.fiscal_year, br.request_type, br.cost_type,
              br.requested_amount, br.status, br.priority, br.ai_summary,
              br.risk_flag, d.name AS department
       FROM budget_requests br JOIN departments d ON d.id = br.department_id
       ${where} ORDER BY br.priority DESC, br.requested_amount DESC LIMIT 50`, values
    ),
    pool.query(
      `SELECT br.id, SUM(brs.weighted_score)::numeric AS total_score
       FROM budget_requests br
       JOIN budget_request_scores brs ON brs.request_id = br.id
       ${where.replace("br.", "br.")}
       GROUP BY br.id`, values
    )
  ]);

  const scoreMap = new Map(scoreRes.rows.map((r) => [r.id, Number(r.total_score).toFixed(3)]));
  const requests = reqRes.rows;

  if (!requests.length) return { summary: "No submitted budget requests found for the selected filters.", requestCount: 0 };

  const totalRequested = requests.reduce((s, r) => s + Number(r.requested_amount), 0);
  const byStatus = requests.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  const highRisk  = requests.filter((r) => ["high", "critical"].includes(r.risk_flag)).length;

  const audiencePrompts = {
    analyst:  "Write a detailed analyst briefing with per-department breakdown, risk flags, and scoring insights.",
    dean:     "Write a dean-level summary: focus on top requests by department, strategic alignment, and recommended priorities. Keep it to 2-3 paragraphs.",
    cabinet:  "Write a cabinet executive summary: total budget impact, key strategic requests, top risks, and a recommended funding priority order. Keep it concise and board-ready.",
    board:    "Write a board-ready narrative summary: focus on total ask, strategic fit, risk posture, and recommended decision. Under 200 words, formal tone."
  };

  const prompt = `${audiencePrompts[audienceLevel] || audiencePrompts.analyst}

BUDGET REQUESTS DATA:
Total Requests: ${requests.length}
Total Requested: $${totalRequested.toLocaleString()}
By Status: ${JSON.stringify(byStatus)}
High/Critical Risk Flags: ${highRisk}
Fiscal Year: ${fiscalYear || "All"}

TOP REQUESTS (by priority and amount):
${requests.slice(0, 15).map((r, i) =>
  `${i + 1}. [${r.department}] ${r.title} — $${Number(r.requested_amount).toLocaleString()} | Type: ${r.request_type} | Status: ${r.status} | Risk: ${r.risk_flag || "none"}${r.ai_summary ? ` | AI: ${r.ai_summary.slice(0, 100)}` : ""}`
).join("\n")}`;

  let summary = "";

  if (env.openAiApiKey) {
    try {
      const completion = await getOpenAi().chat.completions.create({
        model: env.openAiChatModel,
        messages: [
          { role: "system", content: "You are a senior budget analyst producing concise, accurate budget briefings for institutional leadership. Be factual, precise, and professional." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1500
      });
      summary = completion.choices[0].message.content.trim();
    } catch (err) {
      console.error("Summary generation failed:", err.message);
    }
  }

  if (!summary) {
    summary = `Budget Summary (${fiscalYear || "All FY"}): ${requests.length} requests totaling $${totalRequested.toLocaleString()}. Status breakdown: ${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(", ")}. ${highRisk} requests flagged as high/critical risk.`;
  }

  return { summary, requestCount: requests.length, totalRequested, byStatus, highRiskCount: highRisk };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANOMALY DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export async function getAnomalyDashboard({ fiscalYear } = {}) {
  const filters = ["is_resolved = false"];
  const values  = [];
  if (fiscalYear) { values.push(fiscalYear); filters.push(`baf.fiscal_year = $${values.length}`); }

  const where = `WHERE ${filters.join(" AND ")}`;

  const [flagsRes, countsRes] = await Promise.all([
    pool.query(
      `SELECT baf.id, baf.flag_type, baf.severity, baf.description, baf.details,
              baf.fiscal_year, baf.created_at,
              d.name AS department_name,
              br.title AS request_title, br.requested_amount, br.status AS request_status
       FROM budget_anomaly_flags baf
       LEFT JOIN departments d  ON d.id  = baf.department_id
       LEFT JOIN budget_requests br ON br.id = baf.request_id
       ${where} ORDER BY baf.severity DESC, baf.created_at DESC LIMIT 50`, values
    ),
    pool.query(
      `SELECT flag_type, severity, COUNT(*)::int AS count
       FROM budget_anomaly_flags baf ${where} GROUP BY flag_type, severity`, values
    )
  ]);

  return { flags: flagsRes.rows, counts: countsRes.rows };
}

export async function resolveAnomalyFlag(flagId, userId) {
  const res = await pool.query(
    `UPDATE budget_anomaly_flags SET is_resolved = true, resolved_by = $1, resolved_at = now()
     WHERE id = $2 RETURNING id`, [userId, flagId]
  );
  if (!res.rowCount) throw Object.assign(new Error("Anomaly flag not found"), { statusCode: 404 });
  return { resolved: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export async function exportBudgetRequestsXlsx({ fiscalYear, status, departmentId } = {}) {
  const filters = [];
  const values  = [];

  if (departmentId) { values.push(departmentId); filters.push(`br.department_id = $${values.length}`); }
  if (status && status !== "all") { values.push(status); filters.push(`br.status = $${values.length}`); }
  if (fiscalYear)   { values.push(fiscalYear);   filters.push(`br.fiscal_year = $${values.length}`); }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const [reqRes, scoresRes, validRes] = await Promise.all([
    pool.query(
      `SELECT ${REQUEST_SELECT} ${where} ORDER BY br.created_at DESC LIMIT 2000`, values
    ),
    pool.query(
      `SELECT brs.request_id, bsc.label AS criteria, brs.raw_score, brs.weighted_score, brs.rationale
       FROM budget_request_scores brs
       JOIN budget_scoring_criteria bsc ON bsc.key = brs.criteria_key
       ORDER BY brs.request_id, bsc.label`
    ),
    pool.query(
      `SELECT request_id, rule_label, severity, passed, message
       FROM budget_request_validations ORDER BY request_id, severity DESC`
    )
  ]);

  const requests  = reqRes.rows.map(toRequest);

  // Compute total weighted score per request
  const scoreMap  = new Map();
  for (const s of scoresRes.rows) {
    if (!scoreMap.has(s.request_id)) scoreMap.set(s.request_id, 0);
    scoreMap.set(s.request_id, scoreMap.get(s.request_id) + Number(s.weighted_score));
  }

  // ── Sheet 1: Budget Requests ────────────────────────────────────────────────
  const requestRows = requests.map((r) => ({
    "Title":               r.title,
    "Department":          r.departmentName,
    "Fiscal Year":         r.fiscalYear,
    "Request Type":        r.requestType,
    "Cost Type":           r.costType,
    "Expense Category":    r.expenseCategory || "",
    "Fund Type":           r.fundType || "",
    "Base Budget ($)":     r.baseBudgetAmount,
    "Requested Amount ($)":r.requestedAmount,
    "Recurring Amount ($)":r.recurringAmount,
    "One-Time Amount ($)": r.oneTimeAmount,
    "Status":              r.status,
    "Priority":            r.priority || "",
    "Risk Flag":           r.riskFlag || "none",
    "AI Score (/10)":      scoreMap.has(r.id) ? Number((scoreMap.get(r.id) * 10).toFixed(2)) : "",
    "AI Confidence (%)":   r.aiConfidence ? Math.round(r.aiConfidence * 100) : "",
    "AI Summary":          r.aiSummary || "",
    "Justification":       r.justification,
    "Strategic Alignment": r.strategicAlignment || "",
    "Impact Description":  r.impactDescription || "",
    "Submitted By":        r.submittedByName || "",
    "Submitted At":        r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "",
    "Reviewed By":         r.reviewedByName || "",
    "Reviewed At":         r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString() : "",
    "Reviewer Notes":      r.reviewerNotes || "",
    "Decision Rationale":  r.decisionRationale || "",
    "Deadline":            r.deadline ? new Date(r.deadline).toLocaleDateString() : "",
    "Created At":          new Date(r.createdAt).toLocaleDateString()
  }));

  // ── Sheet 2: Scoring Detail ─────────────────────────────────────────────────
  const scoreRows = scoresRes.rows.map((s) => {
    const req = requests.find((r) => r.id === s.request_id);
    return {
      "Request Title":  req?.title || s.request_id,
      "Department":     req?.departmentName || "",
      "Fiscal Year":    req?.fiscalYear || "",
      "Criteria":       s.criteria,
      "Raw Score (/10)":Number(s.raw_score),
      "Weighted Score": Number(Number(s.weighted_score).toFixed(4)),
      "Rationale":      s.rationale || ""
    };
  });

  // ── Sheet 3: Validation Results ─────────────────────────────────────────────
  const validRows = validRes.rows.map((v) => {
    const req = requests.find((r) => r.id === v.request_id);
    return {
      "Request Title": req?.title || v.request_id,
      "Department":    req?.departmentName || "",
      "Rule":          v.rule_label,
      "Severity":      v.severity,
      "Passed":        v.passed ? "YES" : "NO",
      "Message":       v.passed ? "" : v.message
    };
  });

  // ── Sheet 4: Anomaly Flags ──────────────────────────────────────────────────
  const anomalyFilters = ["is_resolved = false"];
  if (fiscalYear) anomalyFilters.push(`baf.fiscal_year = '${fiscalYear.replace(/'/g, "''")}'`);
  const anomalyRes = await pool.query(
    `SELECT baf.flag_type, baf.severity, baf.description, baf.fiscal_year,
            d.name AS department_name, br.title AS request_title, br.requested_amount
     FROM budget_anomaly_flags baf
     LEFT JOIN departments d  ON d.id  = baf.department_id
     LEFT JOIN budget_requests br ON br.id = baf.request_id
     WHERE ${anomalyFilters.join(" AND ")}
     ORDER BY baf.severity DESC, baf.created_at DESC`
  );

  const anomalyRows = anomalyRes.rows.map((a) => ({
    "Flag Type":       a.flag_type.replace(/_/g, " "),
    "Severity":        a.severity,
    "Department":      a.department_name || "",
    "Request Title":   a.request_title || "",
    "Amount ($)":      a.requested_amount ? Number(a.requested_amount) : "",
    "Fiscal Year":     a.fiscal_year || "",
    "Description":     a.description
  }));

  // ── Build workbook ──────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(requestRows.length ? requestRows : [{ Note: "No requests match filters" }]), "Budget Requests");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scoreRows.length   ? scoreRows   : [{ Note: "No scoring data" }]),          "Scoring Detail");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(validRows.length   ? validRows   : [{ Note: "No validation data" }]),        "Validations");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(anomalyRows.length ? anomalyRows : [{ Note: "No open anomaly flags" }]),     "Anomaly Flags");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
