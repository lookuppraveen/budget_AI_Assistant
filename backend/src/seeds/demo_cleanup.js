/**
 * Demo Data Cleanup Script – Budget AI Assistant
 * -----------------------------------------------
 * Removes ONLY the demo seed data inserted by demo_seed.js / demo_seed_prod.js
 * Does NOT touch any real production data.
 *
 * Run: node backend/src/seeds/demo_cleanup.js
 * On server: docker exec -it budget_ai_backend node src/seeds/demo_cleanup.js
 */

import "../config/env.js";
import { pool } from "../config/db.js";

function log(msg) { console.log(`  ✓ ${msg}`); }
function section(msg) { console.log(`\n── ${msg} ─────────────────────────────────`); }

// ── Demo user emails ──────────────────────────────────────────────────────────
const DEMO_EMAILS = [
  "admin@demo.edu",
  "analyst@demo.edu",
  "editor.it@demo.edu",
  "editor.acad@demo.edu",
  "editor.fac@demo.edu",
  "editor.res@demo.edu",
  "editor.hr@demo.edu",
  "viewer@demo.edu",
  "cabinet@demo.edu",
  "board@demo.edu",
];

// ── Demo scenario names ───────────────────────────────────────────────────────
const DEMO_SCENARIOS = [
  "FY27 Best Case – Strong Enrollment Recovery",
  "FY27 Expected – Moderate Growth",
  "FY27 Constrained – Budget Reduction Scenario",
  "FY27 Custom – Nursing Program Expansion",
  "FY26 Final – Actual Outcome",
];

// ── Demo knowledge document titles ───────────────────────────────────────────
const DEMO_DOCS = [
  "FY27 Budget Development Policy & Guidelines",
  "Strategic Plan 2025-2030: Institutional Priorities Summary",
  "Technology Procurement & Vendor Management Policy",
  "FY26 Annual Budget Report – Final Outcomes",
  "Human Resources Staffing & Compensation Framework",
];

// ── Demo manual report titles ─────────────────────────────────────────────────
const DEMO_REPORTS = [
  "FY27 Budget Request Portfolio – Executive Summary",
  "Strategic Alignment Analysis – FY27 Requests vs. 2025-2030 Plan",
];

// ── Demo budget request titles ────────────────────────────────────────────────
const DEMO_REQUESTS = [
  "Enterprise Learning Management System Upgrade (Canvas)",
  "HVAC Replacement – Science Building Floors 3-5",
  "Academic Advisor Expansion – 4 FTE Positions",
  "Cybersecurity Operations Center – Annual License Renewal",
  "Research Instrumentation: Mass Spectrometer Acquisition",
  "Employee Wellness Program – Mental Health Services Expansion",
  "Athletics Facility Lighting Upgrade – LED Retrofit",
  "New Student Orientation Center – Construction Phase 1",
  "Department Vehicle Fleet – 3 New Faculty Vehicles",
  "Data Analytics Platform – Institutional Research",
  "Classroom Technology Refresh – 22 Rooms Phase 2",
  "Financial Aid Counselor – 2 FTE (FY26)",
  "Network Infrastructure Upgrade – Core Switching",
];

// ── Demo decision log subjects ────────────────────────────────────────────────
const DEMO_DECISIONS = [
  "FY27 Budget Development Calendar & Submission Guidelines",
  "Technology Refresh Priority Framework – 5-Year Cycle Adoption",
  "LMS Replacement: Blackboard to Canvas – Approval Rationale",
  "HVAC Emergency Override – Science Building Priority Escalation",
  "Academic Advising Staffing Model Review – Ratio Analysis",
  "Capital Threshold Policy Update – $500K Cabinet Review Requirement",
];

// ── Demo department codes added by seed ──────────────────────────────────────
const DEMO_DEPT_CODES = ["RES", "ATH"];  // only these were NEW; others already existed

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log("║   Budget AI Assistant – Demo Data Cleanup          ║");
  console.log("╚════════════════════════════════════════════════════╝");
  console.log("\n⚠  This will remove ONLY demo seed data.");
  console.log("   Real production data will NOT be affected.\n");

  try {
    // ── 1. Get demo user IDs ────────────────────────────────────────────────
    section("Finding demo users");
    const userRes = await query(
      `SELECT id, email FROM users WHERE email = ANY($1)`,
      [DEMO_EMAILS]
    );
    const demoUserIds = userRes.rows.map((r) => r.id);
    log(`Found ${demoUserIds.length} demo users`);

    // ── 2. Manual Reports ───────────────────────────────────────────────────
    section("Removing Manual Reports");
    const mrRes = await query(
      `DELETE FROM manual_reports WHERE title = ANY($1) RETURNING title`,
      [DEMO_REPORTS]
    );
    mrRes.rows.forEach((r) => log(`Deleted report: ${r.title.slice(0, 60)}`));
    if (mrRes.rows.length === 0) log("No demo reports found");

    // ── 3. Knowledge Documents (cascades to chunks) ─────────────────────────
    section("Removing Knowledge Documents & Chunks");
    const kdRes = await query(
      `DELETE FROM knowledge_documents WHERE title = ANY($1) RETURNING title`,
      [DEMO_DOCS]
    );
    kdRes.rows.forEach((r) => log(`Deleted doc + chunks: ${r.title.slice(0, 60)}`));
    if (kdRes.rows.length === 0) log("No demo knowledge docs found");

    // ── 4. Budget Requests (cascades to scores, validations, anomaly flags) ─
    section("Removing Budget Requests");
    const brRes = await query(
      `DELETE FROM budget_requests WHERE title = ANY($1) RETURNING title`,
      [DEMO_REQUESTS]
    );
    brRes.rows.forEach((r) => log(`Deleted request: ${r.title.slice(0, 60)}`));
    if (brRes.rows.length === 0) log("No demo budget requests found");

    // ── 5. Anomaly Flags (any remaining not cascaded) ──────────────────────
    section("Removing Anomaly Flags");
    const afRes = await query(
      `DELETE FROM budget_anomaly_flags WHERE flag_type IN ('yoy_increase','exceeds_dept_norm','missing_prior_year') AND fiscal_year = 'FY27' RETURNING id`
    );
    log(`Deleted ${afRes.rows.length} anomaly flags`);

    // ── 6. Decision Log ─────────────────────────────────────────────────────
    section("Removing Decision Log Entries");
    const dlRes = await query(
      `DELETE FROM decision_log WHERE subject = ANY($1) RETURNING subject`,
      [DEMO_DECISIONS]
    );
    dlRes.rows.forEach((r) => log(`Deleted: ${r.subject.slice(0, 60)}`));
    if (dlRes.rows.length === 0) log("No demo decision log entries found");

    // ── 7. Budget Scenarios ─────────────────────────────────────────────────
    section("Removing Budget Scenarios");
    const bsRes = await query(
      `DELETE FROM budget_scenarios WHERE name = ANY($1) RETURNING name`,
      [DEMO_SCENARIOS]
    );
    bsRes.rows.forEach((r) => log(`Deleted scenario: ${r.name.slice(0, 60)}`));
    if (bsRes.rows.length === 0) log("No demo scenarios found");

    // ── 8. Demo Users ───────────────────────────────────────────────────────
    section("Removing Demo Users");
    if (demoUserIds.length > 0) {
      const delUsers = await query(
        `DELETE FROM users WHERE email = ANY($1) RETURNING email`,
        [DEMO_EMAILS]
      );
      delUsers.rows.forEach((r) => log(`Deleted user: ${r.email}`));
    } else {
      log("No demo users found");
    }

    // ── 9. Demo Departments (only newly added ones) ─────────────────────────
    section("Removing Demo-only Departments");
    const ddRes = await query(
      `DELETE FROM departments WHERE code = ANY($1) RETURNING name`,
      [DEMO_DEPT_CODES]
    );
    ddRes.rows.forEach((r) => log(`Deleted department: ${r.name}`));
    if (ddRes.rows.length === 0) log("No demo-only departments to remove");

    console.log("\n╔════════════════════════════════════════════════════╗");
    console.log("║   ✅ Cleanup complete!                              ║");
    console.log("╚════════════════════════════════════════════════════╝");
    console.log("\n  All demo seed data removed.");
    console.log("  Real production data untouched.\n");

  } catch (err) {
    console.error("\n❌ Cleanup failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
