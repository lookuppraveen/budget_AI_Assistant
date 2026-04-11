import { pool } from "../../config/db.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toScenario(row) {
  return {
    id:                     row.id,
    name:                   row.name,
    scenarioType:           row.scenario_type,
    description:            row.description,
    fiscalYear:             row.fiscal_year,
    baseRevenue:            Number(row.base_revenue),
    enrollmentChangePct:    Number(row.enrollment_change_pct),
    tuitionChangePct:       Number(row.tuition_change_pct),
    stateFundingChangePct:  Number(row.state_funding_change_pct),
    salaryPoolPct:          Number(row.salary_pool_pct),
    hiringFreeze:           row.hiring_freeze,
    capitalDeferralPct:     Number(row.capital_deferral_pct),
    otherExpenseChangePct:  Number(row.other_expense_change_pct),
    projectedRevenue:       row.projected_revenue  ? Number(row.projected_revenue)  : null,
    projectedExpense:       row.projected_expense  ? Number(row.projected_expense)  : null,
    projectedSurplusDeficit:row.projected_surplus_deficit ? Number(row.projected_surplus_deficit) : null,
    baseExpense:            row.base_expense       ? Number(row.base_expense)       : null,
    revenueBreakdown:       row.revenue_breakdown  || null,
    expenseBreakdown:       row.expense_breakdown  || null,
    createdByName:          row.created_by_name    || null,
    createdAt:              row.created_at,
    updatedAt:              row.updated_at
  };
}

// ── Engine: compute scenario projections ─────────────────────────────────────

async function computeProjections(scenario) {
  const { fiscalYear, baseRevenue, enrollmentChangePct, tuitionChangePct,
          stateFundingChangePct, salaryPoolPct, hiringFreeze,
          capitalDeferralPct, otherExpenseChangePct } = scenario;

  // Pull approved + submitted budget requests for the fiscal year as expense baseline
  const expRes = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN request_type IN ('staffing') THEN requested_amount END), 0)::numeric AS staffing_total,
       COALESCE(SUM(CASE WHEN request_type = 'capital'    THEN requested_amount END), 0)::numeric AS capital_total,
       COALESCE(SUM(CASE WHEN request_type = 'grant'      THEN requested_amount END), 0)::numeric AS grants_total,
       COALESCE(SUM(CASE WHEN request_type NOT IN ('staffing','capital','grant') THEN requested_amount END), 0)::numeric AS operating_total,
       COALESCE(SUM(requested_amount), 0)::numeric AS grand_total
     FROM budget_requests
     WHERE fiscal_year = $1 AND status IN ('approved','submitted','under_review')`,
    [fiscalYear]
  );

  const exp = expRes.rows[0];
  const staffingBase = Number(exp.staffing_total);
  const capitalBase  = Number(exp.capital_total);
  const grantsBase   = Number(exp.grants_total);
  const operatingBase= Number(exp.operating_total);
  const baseExpense  = Number(exp.grand_total);

  // ── Revenue projections ──────────────────────────────────────────────────
  // Break base revenue into estimated buckets (use common community college ratios if no data)
  // Enrollment-driven tuition ~45%, State aid ~35%, Other ~20%
  const tuitionBase    = baseRevenue * 0.45;
  const stateAidBase   = baseRevenue * 0.35;
  const otherRevBase   = baseRevenue * 0.20;

  const enrollmentFactor = 1 + (enrollmentChangePct / 100);
  const tuitionFactor    = 1 + (tuitionChangePct    / 100);
  const stateFactor      = 1 + (stateFundingChangePct / 100);

  const projTuition  = tuitionBase  * enrollmentFactor * tuitionFactor;
  const projStateAid = stateAidBase * stateFactor;
  const projOtherRev = otherRevBase * enrollmentFactor;

  const projectedRevenue = projTuition + projStateAid + projOtherRev;

  const revenueBreakdown = {
    enrollment: Number(projTuition.toFixed(2)),
    stateAid:   Number(projStateAid.toFixed(2)),
    other:      Number(projOtherRev.toFixed(2))
  };

  // ── Expense projections ──────────────────────────────────────────────────
  const salaryFactor = 1 + (salaryPoolPct / 100);
  const adjustedStaffing = hiringFreeze
    ? staffingBase  // freeze: no increase, any new positions deferred
    : staffingBase * salaryFactor;

  const capitalFactor   = 1 - (capitalDeferralPct / 100);
  const adjustedCapital = capitalBase * capitalFactor;

  const opFactor          = 1 + (otherExpenseChangePct / 100);
  const adjustedOperating = operatingBase * opFactor;

  const projectedExpense = adjustedStaffing + adjustedCapital + grantsBase + adjustedOperating;

  const expenseBreakdown = {
    salaries:  Number(adjustedStaffing.toFixed(2)),
    capital:   Number(adjustedCapital.toFixed(2)),
    grants:    Number(grantsBase.toFixed(2)),
    operating: Number(adjustedOperating.toFixed(2))
  };

  return {
    baseExpense:             Number(baseExpense.toFixed(2)),
    projectedRevenue:        Number(projectedRevenue.toFixed(2)),
    projectedExpense:        Number(projectedExpense.toFixed(2)),
    projectedSurplusDeficit: Number((projectedRevenue - projectedExpense).toFixed(2)),
    revenueBreakdown,
    expenseBreakdown
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listScenarios({ fiscalYear } = {}) {
  const filters = [];
  const values  = [];
  if (fiscalYear) { values.push(fiscalYear); filters.push(`bs.fiscal_year = $${values.length}`); }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const res = await pool.query(
    `SELECT bs.*, u.name AS created_by_name
     FROM budget_scenarios bs
     LEFT JOIN users u ON u.id = bs.created_by
     ${where}
     ORDER BY bs.created_at DESC`,
    values
  );
  return res.rows.map(toScenario);
}

export async function getScenario(id) {
  const res = await pool.query(
    `SELECT bs.*, u.name AS created_by_name
     FROM budget_scenarios bs
     LEFT JOIN users u ON u.id = bs.created_by
     WHERE bs.id = $1`,
    [id]
  );
  if (!res.rowCount) throw Object.assign(new Error("Scenario not found"), { statusCode: 404 });
  return toScenario(res.rows[0]);
}

export async function createScenario(payload, userId) {
  const {
    name, scenarioType = "expected", description, fiscalYear,
    baseRevenue = 0, enrollmentChangePct = 0, tuitionChangePct = 0,
    stateFundingChangePct = 0, salaryPoolPct = 2.5,
    hiringFreeze = false, capitalDeferralPct = 0, otherExpenseChangePct = 0
  } = payload;

  if (!name || !fiscalYear) throw Object.assign(new Error("name and fiscalYear are required"), { statusCode: 400 });

  const insertRes = await pool.query(
    `INSERT INTO budget_scenarios
       (name, scenario_type, description, fiscal_year, base_revenue,
        enrollment_change_pct, tuition_change_pct, state_funding_change_pct,
        salary_pool_pct, hiring_freeze, capital_deferral_pct, other_expense_change_pct,
        created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [name, scenarioType, description || null, fiscalYear, baseRevenue,
     enrollmentChangePct, tuitionChangePct, stateFundingChangePct,
     salaryPoolPct, hiringFreeze, capitalDeferralPct, otherExpenseChangePct, userId]
  );

  const id = insertRes.rows[0].id;

  // Compute and store projections
  const proj = await computeProjections({
    fiscalYear, baseRevenue, enrollmentChangePct, tuitionChangePct,
    stateFundingChangePct, salaryPoolPct, hiringFreeze, capitalDeferralPct, otherExpenseChangePct
  });

  await pool.query(
    `UPDATE budget_scenarios SET
       base_expense = $1, projected_revenue = $2, projected_expense = $3,
       projected_surplus_deficit = $4, revenue_breakdown = $5::jsonb, expense_breakdown = $6::jsonb
     WHERE id = $7`,
    [proj.baseExpense, proj.projectedRevenue, proj.projectedExpense,
     proj.projectedSurplusDeficit, JSON.stringify(proj.revenueBreakdown),
     JSON.stringify(proj.expenseBreakdown), id]
  );

  return getScenario(id);
}

export async function updateScenario(id, payload, userId) {
  const existing = await pool.query(`SELECT * FROM budget_scenarios WHERE id = $1`, [id]);
  if (!existing.rowCount) throw Object.assign(new Error("Scenario not found"), { statusCode: 404 });

  const cur = existing.rows[0];
  const merged = {
    name:                  payload.name                  ?? cur.name,
    scenarioType:          payload.scenarioType          ?? cur.scenario_type,
    description:           payload.description           ?? cur.description,
    fiscalYear:            payload.fiscalYear            ?? cur.fiscal_year,
    baseRevenue:           payload.baseRevenue           ?? Number(cur.base_revenue),
    enrollmentChangePct:   payload.enrollmentChangePct   ?? Number(cur.enrollment_change_pct),
    tuitionChangePct:      payload.tuitionChangePct      ?? Number(cur.tuition_change_pct),
    stateFundingChangePct: payload.stateFundingChangePct ?? Number(cur.state_funding_change_pct),
    salaryPoolPct:         payload.salaryPoolPct         ?? Number(cur.salary_pool_pct),
    hiringFreeze:          payload.hiringFreeze          ?? cur.hiring_freeze,
    capitalDeferralPct:    payload.capitalDeferralPct    ?? Number(cur.capital_deferral_pct),
    otherExpenseChangePct: payload.otherExpenseChangePct ?? Number(cur.other_expense_change_pct)
  };

  const proj = await computeProjections(merged);

  await pool.query(
    `UPDATE budget_scenarios SET
       name = $1, scenario_type = $2, description = $3, fiscal_year = $4,
       base_revenue = $5, enrollment_change_pct = $6, tuition_change_pct = $7,
       state_funding_change_pct = $8, salary_pool_pct = $9, hiring_freeze = $10,
       capital_deferral_pct = $11, other_expense_change_pct = $12,
       base_expense = $13, projected_revenue = $14, projected_expense = $15,
       projected_surplus_deficit = $16, revenue_breakdown = $17::jsonb, expense_breakdown = $18::jsonb,
       updated_at = now()
     WHERE id = $19`,
    [merged.name, merged.scenarioType, merged.description, merged.fiscalYear,
     merged.baseRevenue, merged.enrollmentChangePct, merged.tuitionChangePct,
     merged.stateFundingChangePct, merged.salaryPoolPct, merged.hiringFreeze,
     merged.capitalDeferralPct, merged.otherExpenseChangePct,
     proj.baseExpense, proj.projectedRevenue, proj.projectedExpense,
     proj.projectedSurplusDeficit, JSON.stringify(proj.revenueBreakdown),
     JSON.stringify(proj.expenseBreakdown), id]
  );

  return getScenario(id);
}

export async function deleteScenario(id) {
  const res = await pool.query(`DELETE FROM budget_scenarios WHERE id = $1 RETURNING id`, [id]);
  if (!res.rowCount) throw Object.assign(new Error("Scenario not found"), { statusCode: 404 });
  return { deleted: true };
}

export async function compareScenarios(ids) {
  if (!ids?.length) throw Object.assign(new Error("Provide at least one scenario id"), { statusCode: 400 });
  const res = await pool.query(
    `SELECT bs.*, u.name AS created_by_name FROM budget_scenarios bs
     LEFT JOIN users u ON u.id = bs.created_by
     WHERE bs.id = ANY($1::uuid[])`,
    [ids]
  );
  return res.rows.map(toScenario);
}
