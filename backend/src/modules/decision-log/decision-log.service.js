import { pool } from "../../config/db.js";

function toEntry(row) {
  return {
    id:                    row.id,
    entryType:             row.entry_type,
    subject:               row.subject,
    context:               row.context,
    decision:              row.decision,
    rationale:             row.rationale,
    alternativesConsidered:row.alternatives_considered,
    assumptions:           row.assumptions,
    outcome:               row.outcome,
    fiscalYear:            row.fiscal_year,
    referenceId:           row.reference_id,
    decidedByName:         row.decided_by_name || null,
    decidedById:           row.decided_by,
    decidedAt:             row.decided_at,
    createdByName:         row.created_by_name || null,
    createdById:           row.created_by,
    createdAt:             row.created_at,
    updatedAt:             row.updated_at,
    // enrichment when joined to budget_requests
    requestTitle:          row.request_title || null,
    requestStatus:         row.request_status || null,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listDecisionLog({ fiscalYear, entryType, referenceId, page = 1, limit = 50 } = {}) {
  const filters = [];
  const values  = [];

  if (fiscalYear)  { values.push(fiscalYear);  filters.push(`dl.fiscal_year = $${values.length}`); }
  if (entryType)   { values.push(entryType);   filters.push(`dl.entry_type = $${values.length}`); }
  if (referenceId) { values.push(referenceId); filters.push(`dl.reference_id = $${values.length}`); }

  const where  = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const offset = (Math.max(1, page) - 1) * limit;
  values.push(limit, offset);

  const [res, countRes] = await Promise.all([
    pool.query(
      `SELECT
         dl.*,
         u1.name AS decided_by_name,
         u2.name AS created_by_name,
         br.title AS request_title,
         br.status AS request_status
       FROM decision_log dl
       LEFT JOIN users u1 ON u1.id = dl.decided_by
       LEFT JOIN users u2 ON u2.id = dl.created_by
       LEFT JOIN budget_requests br ON br.id = dl.reference_id
       ${where}
       ORDER BY dl.decided_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    ),
    pool.query(
      `SELECT COUNT(*) FROM decision_log dl ${where}`,
      values.slice(0, -2)
    ),
  ]);

  return {
    entries: res.rows.map(toEntry),
    total:   Number(countRes.rows[0].count),
    page:    Number(page),
    limit:   Number(limit),
  };
}

export async function getDecisionEntry(id) {
  const res = await pool.query(
    `SELECT
       dl.*,
       u1.name AS decided_by_name,
       u2.name AS created_by_name,
       br.title AS request_title,
       br.status AS request_status
     FROM decision_log dl
     LEFT JOIN users u1 ON u1.id = dl.decided_by
     LEFT JOIN users u2 ON u2.id = dl.created_by
     LEFT JOIN budget_requests br ON br.id = dl.reference_id
     WHERE dl.id = $1`,
    [id]
  );
  if (!res.rowCount) throw Object.assign(new Error("Decision log entry not found"), { statusCode: 404 });
  return toEntry(res.rows[0]);
}

export async function createDecisionEntry(payload, userId) {
  const {
    entryType = "other", subject, context, decision, rationale,
    alternativesConsidered, assumptions, outcome, fiscalYear,
    referenceId, decidedById, decidedAt
  } = payload;

  if (!subject || !decision) {
    throw Object.assign(new Error("subject and decision are required"), { statusCode: 400 });
  }

  const res = await pool.query(
    `INSERT INTO decision_log
       (entry_type, subject, context, decision, rationale,
        alternatives_considered, assumptions, outcome, fiscal_year,
        reference_id, decided_by, decided_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      entryType, subject, context || null, decision, rationale || null,
      alternativesConsidered || null, assumptions || null, outcome || null,
      fiscalYear || null, referenceId || null,
      decidedById || userId,
      decidedAt   || new Date().toISOString(),
      userId
    ]
  );

  return getDecisionEntry(res.rows[0].id);
}

export async function updateDecisionEntry(id, payload, userId) {
  const existing = await pool.query(`SELECT * FROM decision_log WHERE id = $1`, [id]);
  if (!existing.rowCount) throw Object.assign(new Error("Decision log entry not found"), { statusCode: 404 });

  const cur = existing.rows[0];
  const m = {
    entryType:             payload.entryType             ?? cur.entry_type,
    subject:               payload.subject               ?? cur.subject,
    context:               payload.context               ?? cur.context,
    decision:              payload.decision              ?? cur.decision,
    rationale:             payload.rationale             ?? cur.rationale,
    alternativesConsidered:payload.alternativesConsidered ?? cur.alternatives_considered,
    assumptions:           payload.assumptions           ?? cur.assumptions,
    outcome:               payload.outcome               ?? cur.outcome,
    fiscalYear:            payload.fiscalYear            ?? cur.fiscal_year,
    referenceId:           payload.referenceId           ?? cur.reference_id,
    decidedById:           payload.decidedById           ?? cur.decided_by,
    decidedAt:             payload.decidedAt             ?? cur.decided_at,
  };

  await pool.query(
    `UPDATE decision_log SET
       entry_type = $1, subject = $2, context = $3, decision = $4, rationale = $5,
       alternatives_considered = $6, assumptions = $7, outcome = $8, fiscal_year = $9,
       reference_id = $10, decided_by = $11, decided_at = $12, updated_at = now()
     WHERE id = $13`,
    [
      m.entryType, m.subject, m.context, m.decision, m.rationale,
      m.alternativesConsidered, m.assumptions, m.outcome, m.fiscalYear,
      m.referenceId, m.decidedById, m.decidedAt, id
    ]
  );

  return getDecisionEntry(id);
}

export async function deleteDecisionEntry(id) {
  const res = await pool.query(`DELETE FROM decision_log WHERE id = $1 RETURNING id`, [id]);
  if (!res.rowCount) throw Object.assign(new Error("Decision log entry not found"), { statusCode: 404 });
  return { deleted: true };
}

// ── Auto-log helper (called from budget-requests service on review) ───────────

export async function autoLogBudgetDecision({ requestId, requestTitle, decision, rationale, fiscalYear, decidedById }) {
  try {
    await pool.query(
      `INSERT INTO decision_log
         (entry_type, subject, decision, rationale, fiscal_year, reference_id, decided_by, decided_at, created_by)
       VALUES ('budget_request', $1, $2, $3, $4, $5, $6, now(), $6)`,
      [
        `Budget Request: ${requestTitle}`,
        decision,
        rationale || null,
        fiscalYear || null,
        requestId,
        decidedById,
      ]
    );
  } catch (err) {
    // Non-fatal: log but don't throw
    console.error("[decision-log] autoLog failed:", err.message);
  }
}
