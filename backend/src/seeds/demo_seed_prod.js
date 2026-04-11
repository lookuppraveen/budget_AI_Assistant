/**
 * Demo Seed Script – Budget AI Assistant
 * ---------------------------------------
 * Populates the database with realistic university demo data
 * for testing all modules: Budget Requests, Scenarios, Decision Log,
 * Knowledge, Reports, Chat, Dashboard, Analytics.
 *
 * Run: node backend/src/seeds/demo_seed.js
 *
 * Safe to re-run: uses ON CONFLICT DO NOTHING / checks before insert.
 * Does NOT drop existing data.
 *
 * Demo logins (password for all: Demo@1234)
 *   admin@demo.edu        – Admin
 *   analyst@demo.edu      – Budget Analyst
 *   editor.it@demo.edu    – Department Editor (IT)
 *   editor.acad@demo.edu  – Department Editor (Academic Affairs)
 *   editor.fac@demo.edu   – Department Editor (Facilities)
 *   viewer@demo.edu       – Viewer (Student Services)
 *   cabinet@demo.edu      – Cabinet
 *   board@demo.edu        – Board Summary
 */

import "../config/env.js"; // loads .env
import { pool } from "../config/db.js";
import bcrypt from "bcryptjs";

const DEMO_PASSWORD = "Demo@1234";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res;
}

function log(msg) { console.log(`  ✓ ${msg}`); }
function section(msg) { console.log(`\n── ${msg} ─────────────────────────────────`); }

// ── 1. Departments ────────────────────────────────────────────────────────────

async function seedDepartments() {
  section("Departments");

  const depts = [
    { name: "Academic Affairs",        code: "ACA",  owner: "Dr. Patricia Webb"   },
    { name: "Student Services",        code: "STD",  owner: "Ms. Karen Holloway"  },
    { name: "Information Technology",  code: "IT",   owner: "Mr. James Carver"    },
    { name: "Facilities Management",   code: "FAC",  owner: "Mr. Robert Tran"     },
    { name: "Finance & Administration",code: "FIN",  owner: "Ms. Linda Schwartz"  },
    { name: "Research & Innovation",   code: "RES",  owner: "Dr. Ahmed Hassan"    },
    { name: "Human Resources",         code: "HR",   owner: "Ms. Diana Price"     },
    { name: "Athletics",               code: "ATH",  owner: "Mr. Carlos Mendez"   },
  ];

  for (const d of depts) {
    const existing = await query(`SELECT id FROM departments WHERE code = $1 OR name = $2`, [d.code, d.name]);
    if (existing.rows.length > 0) {
      await query(`UPDATE departments SET name = $1, code = $2, owner = $3 WHERE id = $4`, [d.name, d.code, d.owner, existing.rows[0].id]);
      log(`[updated] Department: ${d.name}`);
    } else {
      await query(`INSERT INTO departments (name, code, owner) VALUES ($1, $2, $3)`, [d.name, d.code, d.owner]);
      log(`Department: ${d.name}`);
    }
  }
}

// ── 2. Users ──────────────────────────────────────────────────────────────────

async function seedUsers() {
  section("Users");

  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const users = [
    { name: "Admin User",           email: "admin@demo.edu",        role: "Admin",             dept: "FIN"  },
    { name: "Sandra Kim",           email: "analyst@demo.edu",      role: "Budget Analyst",    dept: "FIN"  },
    { name: "James Carver",         email: "editor.it@demo.edu",    role: "Department Editor", dept: "IT"   },
    { name: "Patricia Webb",        email: "editor.acad@demo.edu",  role: "Department Editor", dept: "ACA"  },
    { name: "Robert Tran",          email: "editor.fac@demo.edu",   role: "Department Editor", dept: "FAC"  },
    { name: "Karen Holloway",       email: "viewer@demo.edu",       role: "Read Only",         dept: "STD"  },
    { name: "Linda Schwartz",       email: "cabinet@demo.edu",      role: "Cabinet",           dept: "FIN"  },
    { name: "Board Member",         email: "board@demo.edu",        role: "Board Summary",     dept: "FIN"  },
    { name: "Ahmed Hassan",         email: "editor.res@demo.edu",   role: "Department Editor", dept: "RES"  },
    { name: "Diana Price",          email: "editor.hr@demo.edu",    role: "Department Editor", dept: "HR"   },
  ];

  const createdUsers = {};

  for (const u of users) {
    // Look up role
    const roleRes = await query(`SELECT id FROM roles WHERE name = $1`, [u.role]);
    if (!roleRes.rows[0]) { console.warn(`  ⚠ Role not found: ${u.role}`); continue; }
    const roleId = roleRes.rows[0].id;

    // Look up department
    const deptRes = await query(`SELECT id FROM departments WHERE code = $1`, [u.dept]);
    if (!deptRes.rows[0]) { console.warn(`  ⚠ Dept not found: ${u.dept}`); continue; }
    const deptId = deptRes.rows[0].id;

    const res = await query(
      `INSERT INTO users (name, email, password_hash, role_id, department_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role_id = EXCLUDED.role_id
       RETURNING id`,
      [u.name, u.email, hash, roleId, deptId]
    );
    createdUsers[u.email] = res.rows[0].id;
    log(`User: ${u.name} <${u.email}> [${u.role}]`);
  }

  return createdUsers;
}

// ── 3. Budget Requests ────────────────────────────────────────────────────────

async function seedBudgetRequests(users) {
  section("Budget Requests");

  // Get department IDs
  const deptMap = {};
  const depts = await query(`SELECT id, code FROM departments`);
  depts.rows.forEach((d) => { deptMap[d.code] = d.id; });

  const adminId   = users["admin@demo.edu"];
  const analystId = users["analyst@demo.edu"];
  const editorIT  = users["editor.it@demo.edu"];
  const editorACAD = users["editor.acad@demo.edu"];
  const editorFAC  = users["editor.fac@demo.edu"];
  const editorRES  = users["editor.res@demo.edu"];
  const editorHR   = users["editor.hr@demo.edu"];

  const requests = [
    // ── APPROVED ──────────────────────────────────────────────────────────────
    {
      title: "Enterprise Learning Management System Upgrade (Canvas)",
      dept: "IT", submitted_by: editorIT, fiscal_year: "FY27",
      fund_type: "General Fund", expense_category: "Technology",
      request_type: "capital", cost_type: "mixed",
      base_budget_amount: 120000, requested_amount: 285000,
      recurring_amount: 45000, one_time_amount: 240000,
      justification: "The current LMS (Blackboard) contract expires in August 2027. Canvas has been selected via competitive RFP as the replacement platform. This covers licensing, data migration, integration with student information system, and faculty training. Blackboard's per-user cost has increased 22% annually while Canvas offers equivalent functionality at lower TCO. Migration must begin no later than January 2027 to meet accreditation reporting deadlines.",
      strategic_alignment: "Directly supports Strategic Priority 2: Student Success Through Technology. Aligns with the 2025-2030 Digital Infrastructure Roadmap.",
      impact_description: "Affects 12,400 enrolled students and 680 faculty. Canvas adoption institution-wide reduces support tickets by an estimated 35% based on peer institution benchmarks.",
      status: "approved", priority: "high",
      ai_summary: "Strong capital request with clear ROI and accreditation timeline driver. Competitive procurement documented. Migration cost reasonable relative to long-term TCO savings.",
      ai_confidence: 0.91, risk_flag: "low",
      reviewer_notes: "Approved. Procurement office to initiate PO by November 15.",
      decision_rationale: "Mission-critical infrastructure with expiring vendor contract. Cost analysis validates savings over 3-year period. Faculty senate has endorsed transition.",
      submitted_at: "2026-09-10", reviewed_at: "2026-09-28",
      reviewed_by: analystId, assigned_to: analystId,
    },
    {
      title: "HVAC Replacement – Science Building Floors 3-5",
      dept: "FAC", submitted_by: editorFAC, fiscal_year: "FY27",
      fund_type: "Capital Fund", expense_category: "Facilities",
      request_type: "capital", cost_type: "one-time",
      base_budget_amount: 0, requested_amount: 620000,
      recurring_amount: 0, one_time_amount: 620000,
      justification: "Original HVAC units installed in 1998 have exceeded manufacturer service life by 9 years. Failure rate has increased 300% since FY24. Three emergency repairs in the past 18 months totaled $87,000 in unplanned expenditure. Lab environments on floors 3-5 require ASHRAE 62.1 compliance; current system cannot maintain required air exchange rates. State facilities audit flagged this as a priority 1 deferred maintenance item in April 2026.",
      strategic_alignment: "Supports Strategic Priority 4: Sustainable & Safe Campus. Required for continued ABET lab accreditation for the Engineering programs.",
      impact_description: "Affects 14 research labs, 6 teaching labs, and approximately 2,800 daily building occupants. Non-compliance risk to ABET accreditation affects 340 engineering students.",
      status: "approved", priority: "critical",
      ai_summary: "Capital-critical safety and compliance request. Emergency repair history validates urgency. ABET compliance risk adds mandatory urgency classification.",
      ai_confidence: 0.94, risk_flag: "none",
      reviewer_notes: "Approved with full amount. Physical plant to coordinate phased installation to minimize lab disruption.",
      decision_rationale: "Mandatory deferred maintenance with accreditation compliance implications. Emergency repair history demonstrates imminent failure risk.",
      submitted_at: "2026-08-15", reviewed_at: "2026-09-05",
      reviewed_by: adminId, assigned_to: analystId,
    },
    // ── UNDER REVIEW ──────────────────────────────────────────────────────────
    {
      title: "Academic Advisor Expansion – 4 FTE Positions",
      dept: "ACA", submitted_by: editorACAD, fiscal_year: "FY27",
      fund_type: "General Fund", expense_category: "Personnel",
      request_type: "staffing", cost_type: "recurring",
      base_budget_amount: 240000, requested_amount: 340000,
      recurring_amount: 340000, one_time_amount: 0,
      justification: "Current advisor-to-student ratio is 1:420, compared to NACADA recommended best practice of 1:250. Four new FTE academic advisors are required to serve enrollment growth projected at 8% for FY27 (driven by new nursing and engineering cohorts). High caseloads are directly correlated with the 14% first-year attrition rate identified in the FY26 Retention Study. Each advisor position requires salary ($68K avg) + benefits (32%) + onboarding costs ($4K) = $93,800 fully loaded per FTE.",
      strategic_alignment: "Core to Strategic Priority 1: Student Retention & Completion. Referenced in Board 2026 Goal: reduce first-year attrition by 20% by FY28.",
      impact_description: "Directly impacts approximately 1,680 students moving from overloaded advisors. Modeling projects 2.3% retention improvement = 60 additional completions = $2.1M incremental tuition revenue over 4-year degree cycle.",
      status: "under_review", priority: "high",
      ai_summary: "Well-justified staffing request with quantified ROI through retention improvement. Ratio analysis against NACADA standards provides objective benchmark. Revenue impact modeling is compelling.",
      ai_confidence: 0.87, risk_flag: "low",
      reviewer_notes: "Under review pending HR compensation benchmarking for the new positions.",
      submitted_at: "2026-10-01", reviewed_at: null,
      reviewed_by: null, assigned_to: analystId,
    },
    {
      title: "Cybersecurity Operations Center – Annual License Renewal",
      dept: "IT", submitted_by: editorIT, fiscal_year: "FY27",
      fund_type: "General Fund", expense_category: "Technology",
      request_type: "operational", cost_type: "recurring",
      base_budget_amount: 95000, requested_amount: 118000,
      recurring_amount: 118000, one_time_amount: 0,
      justification: "Annual renewal of CrowdStrike Falcon endpoint detection and SentinelOne SIEM platform covering 4,200 endpoints and 15 servers. Current licenses expire January 31, 2027. The 24.2% increase reflects vendor price escalation (18%) plus expansion of 400 new endpoints from FY26 device purchases. Both platforms are required by the institution's cyber insurance policy and passed our last EDUCAUSE security assessment. No adequate open-source alternatives exist at institutional scale.",
      strategic_alignment: "Required by cyber insurance policy (annual $2.3M coverage). Supports Strategic Priority 3: Institutional Resilience.",
      impact_description: "Protects student PII for 12,400 students, employee records for 1,800 staff, and $4.8M in federal research grant data subject to FISMA compliance.",
      status: "under_review", priority: "critical",
      ai_summary: "Compliance-mandatory operational renewal. Insurance policy requirement and FISMA obligations classify this as non-discretionary.",
      ai_confidence: 0.93, risk_flag: "none",
      submitted_at: "2026-09-25",
      reviewed_by: null, assigned_to: analystId,
    },
    {
      title: "Research Instrumentation: Mass Spectrometer Acquisition",
      dept: "RES", submitted_by: editorRES, fiscal_year: "FY27",
      fund_type: "Restricted Fund", expense_category: "Technology",
      request_type: "capital", cost_type: "mixed",
      base_budget_amount: 50000, requested_amount: 475000,
      recurring_amount: 22000, one_time_amount: 453000,
      justification: "Acquisition of a Thermo Scientific Orbitrap Eclipse mass spectrometer to support three active NIH-funded research projects (grant total: $3.2M). Current instrumentation dates to 2009 and lacks the resolution required for proteomics research specified in R01 grant aims. Shared instrumentation with three peer institutions has created 6-8 week scheduling delays that threaten grant deliverable timelines. Annual service contract ($22K) included as recurring cost.",
      strategic_alignment: "Directly enables $3.2M active NIH grants and positions institution for $8M R01 renewal submission in FY28. Supports Strategic Priority 5: Research Excellence.",
      impact_description: "Affects 4 research faculty, 18 graduate students, and 6 postdoctoral fellows. Shared access model recovers ~$40K/year from partner institutions.",
      status: "under_review", priority: "high",
      ai_summary: "Capital equipment with strong grant leverage. NIH deliverable timeline risk provides urgency. Shared instrument recovery partially offsets cost.",
      ai_confidence: 0.85, risk_flag: "medium",
      reviewer_notes: "Awaiting confirmation that NIH indirect cost recovery can offset a portion of the capital cost.",
      submitted_at: "2026-10-05",
      reviewed_by: null, assigned_to: analystId,
    },
    // ── SUBMITTED (not yet reviewed) ──────────────────────────────────────────
    {
      title: "Employee Wellness Program – Mental Health Services Expansion",
      dept: "HR", submitted_by: editorHR, fiscal_year: "FY27",
      fund_type: "General Fund", expense_category: "Operations",
      request_type: "operational", cost_type: "recurring",
      base_budget_amount: 45000, requested_amount: 92000,
      recurring_amount: 92000, one_time_amount: 0,
      justification: "FY26 employee engagement survey identified mental health support as the top unmet need (68% of respondents). EAP utilization increased 41% since FY24. This request covers: (1) Expanded EAP sessions from 3 to 8 per employee ($31K), (2) Two in-house licensed counselors contracted 10 hrs/week each ($38K), (3) Wellness platform (Calm Business) for all 1,800 employees ($23K). Similar expansions at three peer institutions reduced turnover by 12-15%, with replacement cost per employee averaging $28,000.",
      strategic_alignment: "Supports Strategic Priority 6: Talent Attraction & Retention. Required for SHRM Best Places to Work certification submission.",
      impact_description: "Covers all 1,800 employees. Projected 8% reduction in voluntary turnover saves approximately $480K annually in replacement costs.",
      status: "submitted", priority: "normal",
      ai_summary: "Operationally sound wellness expansion with documented ROI through retention savings. Survey data provides objective need assessment.",
      ai_confidence: 0.82, risk_flag: "low",
      submitted_at: "2026-10-08",
    },
    {
      title: "Athletics Facility Lighting Upgrade – LED Retrofit",
      dept: "ATH", submitted_by: adminId, fiscal_year: "FY27",
      fund_type: "Capital Fund", expense_category: "Facilities",
      request_type: "capital", cost_type: "one-time",
      base_budget_amount: 0, requested_amount: 195000,
      recurring_amount: 0, one_time_amount: 195000,
      justification: "LED retrofit of gymnasium, natatorium, and outdoor track lighting systems. Current metal-halide fixtures consume 780kW average during peak operation. LED replacement projects to reduce consumption to 320kW, saving approximately $54,000 annually at current utility rates. Estimated payback period: 3.6 years. Utility rebate of $28,000 available from State Energy Commission (application submitted). Project qualifies for sustainability bond financing at 3.2% for 7 years.",
      strategic_alignment: "Supports institutional carbon neutrality goal (2035 target). Aligns with Strategic Priority 4: Sustainable Campus.",
      impact_description: "Reduces campus carbon footprint by 180 metric tons CO2 annually. Improved lighting quality expected to increase facility utilization by student clubs and community groups.",
      status: "submitted", priority: "normal",
      ai_summary: "Strong ROI capital request with documented utility savings and rebate income. Sustainability bond financing option reduces upfront budget impact.",
      ai_confidence: 0.88, risk_flag: "none",
      submitted_at: "2026-10-10",
    },
    // ── ON HOLD ───────────────────────────────────────────────────────────────
    {
      title: "New Student Orientation Center – Construction Phase 1",
      dept: "STD", submitted_by: adminId, fiscal_year: "FY27",
      fund_type: "Capital Fund", expense_category: "Facilities",
      request_type: "capital", cost_type: "one-time",
      base_budget_amount: 0, requested_amount: 2400000,
      recurring_amount: 0, one_time_amount: 2400000,
      justification: "Construction of a dedicated 8,000 sq ft student orientation and welcome center adjacent to the main library. Current orientation activities are fragmented across 6 buildings, creating a poor first-year experience. The facility will include a 300-seat auditorium, 12 meeting rooms, virtual tour studio, and parent welcome lounge. Projected to serve 1,800 new students and 3,600 parents annually. Capital campaign fundraising has secured $800K of the $2.4M Phase 1 target.",
      strategic_alignment: "Priority capital project in the Campus Master Plan 2024-2034. Directly addresses Board KPI: First-Year Experience Index score of 4.2 (target 4.7).",
      impact_description: "Serves all 1,800 incoming students. Improved orientation experience linked to 5% retention improvement in institutions with dedicated centers.",
      status: "on_hold", priority: "normal",
      ai_summary: "Large capital project with strong strategic alignment but significant funding gap. Capital campaign progress needs monitoring.",
      ai_confidence: 0.79, risk_flag: "high",
      reviewer_notes: "Placed on hold pending completion of capital campaign fundraising. Revisit at FY28 budget cycle if remaining $1.6M is secured.",
      decision_rationale: "Funding gap of $1.6M exceeds current discretionary capital budget capacity. Strategic priority confirmed but timing deferred.",
      submitted_at: "2026-08-20", reviewed_at: "2026-09-15",
      reviewed_by: adminId, assigned_to: analystId,
    },
    // ── DENIED ────────────────────────────────────────────────────────────────
    {
      title: "Department Vehicle Fleet – 3 New Faculty Vehicles",
      dept: "RES", submitted_by: editorRES, fiscal_year: "FY27",
      fund_type: "General Fund", expense_category: "Operations",
      request_type: "operational", cost_type: "one-time",
      base_budget_amount: 15000, requested_amount: 112000,
      recurring_amount: 0, one_time_amount: 112000,
      justification: "Request for three new vehicles to support field research activities in the Environmental Science and Earth Sciences programs. Current fleet of 2 vehicles (2016, 2018 models) has 189,000 and 147,000 miles respectively. Fleet management estimates $24,000 in deferred maintenance on both vehicles. Field research requires 4-6 vehicle-days per week during collection season (May-October).",
      strategic_alignment: "Supports field research capabilities for two grant-funded projects.",
      impact_description: "Used by approximately 8 faculty researchers and 24 graduate students during field seasons.",
      status: "denied", priority: "low",
      ai_summary: "Vehicle fleet expansion lacks compelling urgency relative to available alternatives. Rental and fleet-share options not fully explored.",
      ai_confidence: 0.76, risk_flag: "low",
      reviewer_notes: "Denied. Fleet Services offers pre-approved rental rates at $65/day. Current vehicles remain operational. Recommend resubmission in FY28 if fleet-share analysis confirms insufficient supply.",
      decision_rationale: "Cost analysis shows rental at $65/day × 200 field-days = $13,000/year vs $112,000 capital plus $18K/year depreciation. Rental is more cost-effective at current utilization levels.",
      submitted_at: "2026-09-12", reviewed_at: "2026-09-30",
      reviewed_by: analystId, assigned_to: analystId,
    },
    // ── DRAFT ─────────────────────────────────────────────────────────────────
    {
      title: "Data Analytics Platform – Institutional Research",
      dept: "FIN", submitted_by: analystId, fiscal_year: "FY27",
      fund_type: "General Fund", expense_category: "Technology",
      request_type: "operational", cost_type: "recurring",
      base_budget_amount: 28000, requested_amount: 67000,
      recurring_amount: 67000, one_time_amount: 0,
      justification: "Replacement of aging Business Objects reporting suite (end-of-life Q3 2027) with Tableau Cloud + Salesforce CRM Analytics integration. Current system requires 3-5 days for ad-hoc report generation; Tableau reduces to same-day. Supports IPEDS reporting, accreditation self-study, and Board dashboard requirements. Pricing includes 20 named licenses and unlimited viewer access.",
      strategic_alignment: "Enables data-driven decision making across all strategic priorities. Required for SACSCOC QEP data collection.",
      impact_description: "Serves Institutional Research (3 FTE), Finance (8 staff), and 45 department-level report consumers. Eliminates $28K legacy maintenance cost.",
      status: "draft", priority: "normal",
    },
    {
      title: "Classroom Technology Refresh – 22 Rooms Phase 2",
      dept: "IT", submitted_by: editorIT, fiscal_year: "FY27",
      fund_type: "General Fund", expense_category: "Technology",
      request_type: "capital", cost_type: "one-time",
      base_budget_amount: 180000, requested_amount: 310000,
      recurring_amount: 0, one_time_amount: 310000,
      justification: "Phase 2 of the 5-year classroom technology refresh cycle covering 22 remaining classrooms in Humanities and Business buildings. Phase 1 (18 classrooms) was completed in FY26. Includes laser projectors, 4K display panels, lecture capture integration, and wireless presentation systems. Current equipment averages 9.2 years old; manufacturer support ended on most units in FY24.",
      strategic_alignment: "IT Infrastructure Roadmap Year 3 deliverable. Supports hybrid teaching modality required by Faculty Senate Academic Technology Policy.",
      impact_description: "Impacts approximately 6,800 student course-section enrollments per semester across the 22 rooms.",
      status: "draft", priority: "normal",
    },
    // ── FY26 HISTORICAL (approved) ────────────────────────────────────────────
    {
      title: "Financial Aid Counselor – 2 FTE (FY26)",
      dept: "STD", submitted_by: adminId, fiscal_year: "FY26",
      fund_type: "General Fund", expense_category: "Personnel",
      request_type: "staffing", cost_type: "recurring",
      base_budget_amount: 120000, requested_amount: 168000,
      recurring_amount: 168000, one_time_amount: 0,
      justification: "Two additional Financial Aid Counselors to address 40% increase in FAFSA completion inquiries following federal FAFSA simplification rollout. Current 4 counselors serve 8,200 students. Average appointment wait time has reached 12 business days, causing enrollment decisions to be delayed. Each position: $62K salary + benefits.",
      strategic_alignment: "Supports access and completion goals. Federal compliance with Title IV counseling requirements.",
      impact_description: "Directly impacts 8,200+ financial aid applicants. Reduced wait times expected to decrease enrollment decision abandonment.",
      status: "approved", priority: "high",
      ai_summary: "Staffing expansion driven by federal regulatory changes and documented service level failure. Title IV compliance considerations add mandatory urgency.",
      ai_confidence: 0.89, risk_flag: "none",
      reviewer_notes: "Approved. Positions posted FY26 Q1.",
      decision_rationale: "Title IV compliance and enrollment retention risk warrant immediate approval.",
      submitted_at: "2025-09-05", reviewed_at: "2025-09-22",
      reviewed_by: adminId, assigned_to: analystId,
    },
    {
      title: "Network Infrastructure Upgrade – Core Switching",
      dept: "IT", submitted_by: editorIT, fiscal_year: "FY26",
      fund_type: "General Fund", expense_category: "Technology",
      request_type: "capital", cost_type: "mixed",
      base_budget_amount: 65000, requested_amount: 420000,
      recurring_amount: 55000, one_time_amount: 365000,
      justification: "Campus core network switches (Cisco Catalyst 6500 series) were installed in 2011 and are 3 years past manufacturer EOS. IOS software vulnerabilities can no longer be patched. Replacement with Catalyst 9000 series provides 40GbE backbone (vs current 10GbE), DNAC automation, and SD-Access segmentation for HIPAA/FERPA data compliance.",
      strategic_alignment: "Critical infrastructure supporting all technology-dependent strategic initiatives. Cyber insurance renewal required evidence of supported hardware by FY27.",
      impact_description: "All 4,200 campus endpoints, 15 data center servers, and 3,100 wireless access points depend on this infrastructure.",
      status: "approved", priority: "critical",
      ai_summary: "Mandatory infrastructure replacement with documented EOS and compliance implications. Insurance requirement adds non-discretionary urgency.",
      ai_confidence: 0.96, risk_flag: "none",
      reviewer_notes: "Approved. Project scoped with 6-month implementation timeline.",
      decision_rationale: "EOS hardware with active CVEs and insurance compliance requirement. Deferral would create unacceptable security exposure.",
      submitted_at: "2025-08-10", reviewed_at: "2025-08-25",
      reviewed_by: adminId, assigned_to: analystId,
    },
  ];

  const createdIds = [];

  for (const r of requests) {
    const deptId = deptMap[r.dept];
    if (!deptId) { console.warn(`  ⚠ Dept not found: ${r.dept}`); continue; }

    const existing = await query(
      `SELECT id FROM budget_requests WHERE title = $1 AND fiscal_year = $2`,
      [r.title, r.fiscal_year]
    );
    if (existing.rows.length > 0) {
      log(`[skip] Budget Request already exists: ${r.title.slice(0, 60)}`);
      createdIds.push({ id: existing.rows[0].id, ...r });
      continue;
    }

    const res = await query(
      `INSERT INTO budget_requests (
         title, fiscal_year, fund_type, expense_category, request_type, cost_type,
         base_budget_amount, requested_amount, recurring_amount, one_time_amount,
         justification, strategic_alignment, impact_description,
         status, priority, submitted_by, department_id,
         ai_summary, ai_confidence, risk_flag,
         reviewer_notes, decision_rationale,
         submitted_at, reviewed_at, reviewed_by, assigned_to
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13,
         $14, $15, $16, $17,
         $18, $19, $20,
         $21, $22,
         $23, $24, $25, $26
       ) RETURNING id`,
      [
        r.title, r.fiscal_year, r.fund_type || null, r.expense_category || null, r.request_type, r.cost_type,
        r.base_budget_amount, r.requested_amount, r.recurring_amount, r.one_time_amount,
        r.justification, r.strategic_alignment || null, r.impact_description || null,
        r.status, r.priority, r.submitted_by, deptId,
        r.ai_summary || null, r.ai_confidence || null, r.risk_flag || "none",
        r.reviewer_notes || null, r.decision_rationale || null,
        r.submitted_at ? new Date(r.submitted_at) : null,
        r.reviewed_at  ? new Date(r.reviewed_at)  : null,
        r.reviewed_by  || null,
        r.assigned_to  || null,
      ]
    );

    const id = res.rows[0].id;
    createdIds.push({ id, ...r });

    // Seed AI scores for analyzed requests
    if (r.ai_summary) {
      const scoreSeeds = [
        { key: "strategic_alignment",  score: r.status === "approved" ? 9.0 : r.status === "denied" ? 5.0 : 7.5 },
        { key: "student_impact",       score: r.expense_category === "Personnel" ? 8.5 : r.expense_category === "Technology" ? 7.0 : 6.5 },
        { key: "mandatory_flag",       score: r.risk_flag === "none" ? 8.0 : r.risk_flag === "low" ? 6.0 : 4.0 },
        { key: "operational_risk",     score: r.priority === "critical" ? 9.5 : r.priority === "high" ? 7.5 : 5.0 },
        { key: "return_on_investment", score: r.status === "approved" ? 7.5 : r.status === "denied" ? 4.5 : 6.0 },
        { key: "compliance_need",      score: r.request_type === "capital" ? 6.5 : 5.0 },
        { key: "equity_access",        score: r.expense_category === "Personnel" ? 7.5 : 5.5 },
      ];

      const weights = { strategic_alignment: 0.200, student_impact: 0.200, mandatory_flag: 0.150, operational_risk: 0.150, return_on_investment: 0.100, compliance_need: 0.100, equity_access: 0.100 };

      for (const s of scoreSeeds) {
        await query(
          `INSERT INTO budget_request_scores (request_id, criteria_key, raw_score, weighted_score, rationale, scored_by)
           VALUES ($1, $2, $3, $4, $5, 'ai')
           ON CONFLICT (request_id, criteria_key) DO NOTHING`,
          [id, s.key, s.score, parseFloat((s.score * (weights[s.key] || 0.143)).toFixed(4)), `AI-assessed based on request content and institutional context.`, ]
        );
      }

      // Mark as analyzed
      await query(
        `UPDATE budget_requests SET analyzed_at = now() WHERE id = $1`,
        [id]
      );

      // Seed validation rules
      const validations = [
        { key: "has_justification",   label: "Justification Provided",     severity: "error",   passed: true,  message: "Justification field is complete" },
        { key: "amount_reasonable",   label: "Amount Within Band",          severity: "warning", passed: r.requested_amount < 500000, message: r.requested_amount >= 500000 ? "Request exceeds $500K threshold — requires Cabinet review" : "Amount is within standard review threshold" },
        { key: "strategic_link",      label: "Strategic Alignment Stated",  severity: "warning", passed: !!r.strategic_alignment, message: r.strategic_alignment ? "Strategic alignment documented" : "No strategic alignment provided" },
        { key: "impact_documented",   label: "Impact Description Present",  severity: "info",    passed: !!r.impact_description, message: r.impact_description ? "Impact description provided" : "Impact description missing — add for stronger case" },
        { key: "deadline_set",        label: "Deadline Set",                severity: "info",    passed: false, message: "No deadline specified — may reduce scheduling priority" },
      ];

      for (const v of validations) {
        await query(
          `INSERT INTO budget_request_validations (request_id, rule_key, rule_label, severity, message, passed)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (request_id, rule_key) DO NOTHING`,
          [id, v.key, v.label, v.severity, v.message, v.passed]
        );
      }
    }

    log(`Budget Request [${r.status.padEnd(12)}]: ${r.title.slice(0, 65)}`);
  }

  return createdIds;
}

// ── 4. Anomaly Flags ──────────────────────────────────────────────────────────

async function seedAnomalyFlags(requests) {
  section("Anomaly Flags");

  const deptMap = {};
  const depts = await query(`SELECT id, code FROM departments`);
  depts.rows.forEach((d) => { deptMap[d.code] = d.id; });

  // Find IT and FAC requests for anomaly linking
  const itHVAC = requests.find((r) => r.dept === "IT" && r.fiscal_year === "FY27" && r.status === "under_review" && r.title.includes("Cybersecurity"));
  const bigCapital = requests.find((r) => r.fiscal_year === "FY27" && r.requested_amount >= 400000);

  const flags = [
    {
      dept: "IT", fiscal_year: "FY27",
      flag_type: "yoy_increase",
      severity: "warning",
      description: "IT department FY27 total requested amount ($1.19M) exceeds FY26 baseline by 47%. Verify alignment with IT strategic roadmap and phased implementation plan.",
      request_id: itHVAC?.id || null,
    },
    {
      dept: "RES", fiscal_year: "FY27",
      flag_type: "exceeds_dept_norm",
      severity: "critical",
      description: "Research & Innovation capital request ($475K mass spectrometer) exceeds department's 3-year average capital request by 8.5x. Confirm NIH grant deliverable timeline before approval.",
      request_id: bigCapital?.id || null,
    },
    {
      dept: "FAC", fiscal_year: "FY27",
      flag_type: "missing_prior_year",
      severity: "info",
      description: "Facilities Management FY27 requests include $620K deferred maintenance (HVAC). State audit compliance deadline requires resolution before December 2026.",
      request_id: null,
    },
  ];

  for (const f of flags) {
    const deptId = deptMap[f.dept];
    if (!deptId) { console.warn(`  ⚠ Dept not found for anomaly: ${f.dept}`); continue; }
    const existing = await query(
      `SELECT id FROM budget_anomaly_flags WHERE flag_type = $1 AND department_id = $2 AND fiscal_year = $3`,
      [f.flag_type, deptId, f.fiscal_year]
    );
    if (existing.rows.length > 0) { log(`[skip] Anomaly flag exists: ${f.flag_type}`); continue; }

    await query(
      `INSERT INTO budget_anomaly_flags (request_id, department_id, fiscal_year, flag_type, severity, description, is_resolved)
       VALUES ($1, $2, $3, $4, $5, $6, false)`,
      [f.request_id, deptId, f.fiscal_year, f.flag_type, f.severity, f.description]
    );
    log(`Anomaly Flag [${f.severity}]: ${f.flag_type} – ${f.dept}`);
  }
}

// ── 5. Budget Scenarios ───────────────────────────────────────────────────────

async function seedScenarios(users) {
  section("Budget Scenarios (Scenario Planning)");

  const creatorId = users["admin@demo.edu"];

  const scenarios = [
    {
      name: "FY27 Best Case – Strong Enrollment Recovery",
      scenario_type: "best",
      fiscal_year: "FY27",
      description: "Optimistic scenario assuming enrollment rebound driven by expanded online programs and successful transfer articulation agreements with 4 community colleges. State funding restored to pre-FY25 levels.",
      base_revenue: 48500000,
      enrollment_change_pct: 4.5,
      tuition_change_pct: 3.0,
      state_funding_change_pct: 2.5,
      salary_pool_pct: 3.0,
      hiring_freeze: false,
      capital_deferral_pct: 0,
      other_expense_change_pct: 1.5,
    },
    {
      name: "FY27 Expected – Moderate Growth",
      scenario_type: "expected",
      fiscal_year: "FY27",
      description: "Base planning scenario reflecting 1.5% enrollment growth in line with 3-year trend, modest tuition adjustment, and flat state appropriation. Standard operational cost escalation.",
      base_revenue: 48500000,
      enrollment_change_pct: 1.5,
      tuition_change_pct: 2.0,
      state_funding_change_pct: 0.0,
      salary_pool_pct: 2.5,
      hiring_freeze: false,
      capital_deferral_pct: 10,
      other_expense_change_pct: 2.0,
    },
    {
      name: "FY27 Constrained – Budget Reduction Scenario",
      scenario_type: "constrained",
      fiscal_year: "FY27",
      description: "Adverse scenario reflecting potential state funding cut (aligned with Governor's proposed 6% higher education reduction), enrollment decline in legacy programs, and required hiring freeze. Used for contingency planning.",
      base_revenue: 48500000,
      enrollment_change_pct: -3.5,
      tuition_change_pct: 1.5,
      state_funding_change_pct: -6.0,
      salary_pool_pct: 1.5,
      hiring_freeze: true,
      capital_deferral_pct: 40,
      other_expense_change_pct: -2.5,
    },
    {
      name: "FY27 Custom – Nursing Program Expansion",
      scenario_type: "custom",
      fiscal_year: "FY27",
      description: "Custom scenario modeling impact of new accelerated BSN program launching Fall 2027: 180 additional nursing students, dedicated facility costs, and 12 new faculty hires offset by substantial tuition premium.",
      base_revenue: 48500000,
      enrollment_change_pct: 3.8,
      tuition_change_pct: 5.5,
      state_funding_change_pct: 1.0,
      salary_pool_pct: 3.5,
      hiring_freeze: false,
      capital_deferral_pct: 5,
      other_expense_change_pct: 4.0,
    },
    {
      name: "FY26 Final – Actual Outcome",
      scenario_type: "expected",
      fiscal_year: "FY26",
      description: "FY26 final scenario reflecting actual enrollment of +2.1%, 2.5% tuition increase, flat state aid, and completed network infrastructure capital project.",
      base_revenue: 46200000,
      enrollment_change_pct: 2.1,
      tuition_change_pct: 2.5,
      state_funding_change_pct: 0.0,
      salary_pool_pct: 2.5,
      hiring_freeze: false,
      capital_deferral_pct: 15,
      other_expense_change_pct: 1.8,
    },
  ];

  for (const s of scenarios) {
    const existing = await query(
      `SELECT id FROM budget_scenarios WHERE name = $1`,
      [s.name]
    );
    if (existing.rows.length > 0) { log(`[skip] Scenario exists: ${s.name}`); continue; }

    // Compute simple projections
    const tuitionRevenue    = s.base_revenue * 0.52 * (1 + s.tuition_change_pct / 100);
    const enrollmentRevenue = s.base_revenue * 0.52 * (s.enrollment_change_pct / 100);
    const stateRevenue      = s.base_revenue * 0.30 * (1 + s.state_funding_change_pct / 100);
    const otherRevenue      = s.base_revenue * 0.18;
    const projectedRevenue  = tuitionRevenue + enrollmentRevenue + stateRevenue + otherRevenue;

    const baseExpense       = s.base_revenue * 0.96;
    const salaryExpense     = baseExpense * 0.62 * (1 + s.salary_pool_pct / 100) * (s.hiring_freeze ? 0.97 : 1);
    const capitalExpense    = baseExpense * 0.12 * (1 - s.capital_deferral_pct / 100);
    const otherExpense      = baseExpense * 0.26 * (1 + s.other_expense_change_pct / 100);
    const projectedExpense  = salaryExpense + capitalExpense + otherExpense;
    const surplus           = projectedRevenue - projectedExpense;

    await query(
      `INSERT INTO budget_scenarios (
         name, scenario_type, description, fiscal_year,
         base_revenue, enrollment_change_pct, tuition_change_pct,
         state_funding_change_pct, salary_pool_pct, hiring_freeze,
         capital_deferral_pct, other_expense_change_pct,
         projected_revenue, projected_expense, projected_surplus_deficit,
         base_expense, revenue_breakdown, expense_breakdown, created_by
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7,
         $8, $9, $10,
         $11, $12,
         $13, $14, $15,
         $16, $17, $18, $19
       )`,
      [
        s.name, s.scenario_type, s.description, s.fiscal_year,
        s.base_revenue, s.enrollment_change_pct, s.tuition_change_pct,
        s.state_funding_change_pct, s.salary_pool_pct, s.hiring_freeze,
        s.capital_deferral_pct, s.other_expense_change_pct,
        Math.round(projectedRevenue), Math.round(projectedExpense), Math.round(surplus),
        Math.round(baseExpense),
        JSON.stringify({ enrollment: Math.round(enrollmentRevenue), tuition: Math.round(tuitionRevenue), stateAid: Math.round(stateRevenue), other: Math.round(otherRevenue) }),
        JSON.stringify({ salaries: Math.round(salaryExpense), capital: Math.round(capitalExpense), operating: Math.round(otherExpense), grants: 0 }),
        creatorId,
      ]
    );
    log(`Scenario [${s.scenario_type.padEnd(10)}]: ${s.name}`);
  }
}

// ── 6. Decision Log ───────────────────────────────────────────────────────────

async function seedDecisionLog(users, requests) {
  section("Decision Log");

  const adminId   = users["admin@demo.edu"];
  const analystId = users["analyst@demo.edu"];

  // Find request IDs for cross-referencing
  const canvasReq   = requests.find((r) => r.title.includes("Canvas"));
  const hvacReq     = requests.find((r) => r.title.includes("HVAC"));
  const advisorReq  = requests.find((r) => r.title.includes("Academic Advisor"));

  const entries = [
    {
      entry_type: "policy",
      subject: "FY27 Budget Development Calendar & Submission Guidelines",
      context: "Annual budget development cycle commenced. Departments need clear timelines and submission standards to ensure quality requests and timely review.",
      decision: "FY27 budget requests open September 1, 2026. All submissions must include: documented strategic alignment, 3-year historical baseline, and impact quantification. Requests over $250K require VP signature. Cabinet review threshold: $500K. Final submission deadline: October 31, 2026.",
      rationale: "Standardized process reduces back-and-forth review cycles and improves scoring consistency. $500K Cabinet threshold aligns with Board-approved delegation matrix.",
      alternatives_considered: "Considered rolling submission model — rejected due to difficulty in comparative prioritization across departments.",
      assumptions: "Assumes enrollment projection finalized by September 15. State budget forecast expected by October 1.",
      outcome: "Calendar distributed to all department heads August 28, 2026. 13 requests received by deadline.",
      fiscal_year: "FY27",
      decided_by: adminId,
      decided_at: new Date("2026-08-28"),
    },
    {
      entry_type: "strategic",
      subject: "Technology Refresh Priority Framework – 5-Year Cycle Adoption",
      context: "Multiple technology capital requests lack consistent scoring methodology. Ad-hoc prioritization has led to equity concerns across departments and difficulty justifying decisions to the Board.",
      decision: "Adopted a formal 5-year Technology Refresh Cycle with defined priority tiers: Tier 1 (EOS/EOS-within-2-years, compliance), Tier 2 (Efficiency/ROI-driven), Tier 3 (Expansion/Enhancement). Tier 1 requests receive automatic budget allocation within approved capital envelope.",
      rationale: "Consistent framework reduces political pressure on individual requests, provides predictable planning horizon for departments, and demonstrates risk management maturity to auditors and accreditors.",
      alternatives_considered: "Considered vendor-managed refresh agreements (rejected — loss of purchasing leverage). Considered 3-year cycle (rejected — insufficient budget horizon for large capital items).",
      assumptions: "Capital budget envelope remains at 12% of total operating budget. IT asset inventory database maintained current.",
      outcome: "Framework approved by Cabinet October 2025. First full cycle application: FY27 budget. Network infrastructure upgrade approved under Tier 1.",
      fiscal_year: "FY27",
      decided_by: adminId,
      decided_at: new Date("2025-10-15"),
      reference_id: canvasReq?.id || null,
    },
    {
      entry_type: "budget_request",
      subject: "LMS Replacement: Blackboard to Canvas – Approval Rationale",
      context: "Enterprise LMS contract expiration in August 2027 requires platform decision by Q1 FY27 to allow adequate migration time. Three-vendor RFP completed August 2026.",
      decision: "Approved Canvas replacement at $285,000 (capital + first-year recurring). Implementation to begin January 2027 with faculty training completed by June 2027.",
      rationale: "Canvas provides equivalent functionality at 18% lower 5-year TCO. Migration window before accreditation visit in Fall 2027 requires early start. Faculty senate unanimously endorsed via October 2026 vote.",
      alternatives_considered: "Blackboard renewal ($328K, 22% increase). D2L Brightspace (eliminated in RFP — integration capabilities insufficient for SIS connectivity requirements).",
      assumptions: "Migration can be completed in 6 months with contracted implementation partner. Faculty training achieved in 3 cohorts.",
      outcome: "Contract executed November 2026. Migration on schedule.",
      fiscal_year: "FY27",
      decided_by: adminId,
      decided_at: new Date("2026-09-28"),
      reference_id: canvasReq?.id || null,
    },
    {
      entry_type: "operational",
      subject: "HVAC Emergency Override – Science Building Priority Escalation",
      context: "State facilities audit April 2026 escalated Science Building HVAC to Priority 1 deferred maintenance. Third emergency repair in 18 months occurred July 2026 ($34K unplanned).",
      decision: "Escalated HVAC replacement from FY28 capital plan to FY27 immediate priority. Full $620K approved from Capital Reserve Fund (not subject to normal budget cycle).",
      rationale: "ABET accreditation site visit scheduled October 2027 requires demonstrated corrective action on deferred maintenance flags. Three emergency repairs in 18 months indicate systemic failure imminent. Insurance carrier notified — coverage may be affected if not addressed.",
      alternatives_considered: "Partial repair of 3rd floor only ($180K) — rejected, would not resolve audit finding. Lease of temporary cooling units ($85K/year) — rejected, not a permanent solution and does not satisfy ABET requirement.",
      assumptions: "Capital Reserve Fund has sufficient balance ($1.4M). Installation can be phased to minimize lab downtime.",
      outcome: "Contractor selected November 2026. Installation scheduled December 2026 – March 2027 in three phases.",
      fiscal_year: "FY27",
      decided_by: adminId,
      decided_at: new Date("2026-09-05"),
      reference_id: hvacReq?.id || null,
    },
    {
      entry_type: "strategic",
      subject: "Academic Advising Staffing Model Review – Ratio Analysis",
      context: "First-year attrition rate rose to 14% in FY26 (from 11% in FY24). FY26 Retention Study linked overloaded advising caseloads as a top 3 contributing factor. NACADA best practice: 1:250 ratio.",
      decision: "Approved principle of expanding advising staff to reach 1:300 ratio by FY28. FY27 request for 4 FTE under review — HR compensation benchmarking to confirm salary bands before final approval.",
      rationale: "ROI modeling shows 2.3% retention improvement = $2.1M incremental tuition revenue over 4-year cohort. Investment of $340K in Year 1 has 6:1 return. Board Goal: reduce first-year attrition 20% by FY28.",
      alternatives_considered: "Peer mentoring program ($45K) — considered as complement, not replacement. Academic coaching technology (Civitas Learning $95K/year) — approved as supplemental tool, does not replace human advisors.",
      assumptions: "Enrollment remains stable or grows. HR can source qualified advisors at modeled salary levels. Retention improvement models based on published NACADA benchmarks.",
      fiscal_year: "FY27",
      decided_by: analystId,
      decided_at: new Date("2026-10-12"),
      reference_id: advisorReq?.id || null,
    },
    {
      entry_type: "policy",
      subject: "Capital Threshold Policy Update – $500K Cabinet Review Requirement",
      context: "Increasing volume of large capital requests (4 over $500K in FY26) required Cabinet-level review that was not formalized in budget policy.",
      decision: "All budget requests exceeding $500,000 require: (1) VP-level endorsement in submission, (2) Capital Planning Committee 30-day review, (3) Cabinet approval before final budget allocation. Requests between $250K-$500K require VP signature only.",
      rationale: "Board delegation matrix assigns Cabinet authority for expenditures over $500K. Formalizing in budget policy ensures process compliance and reduces ad-hoc escalations.",
      alternatives_considered: "Threshold at $250K (too low — would require Cabinet review for routine technology renewals). No threshold (current state — too much Cabinet time on routine items).",
      assumptions: "Capital Planning Committee meets monthly. VP sign-off can be obtained within 5 business days.",
      outcome: "Policy updated in Budget Office procedures manual October 2026. Applied to FY27 cycle.",
      fiscal_year: "FY27",
      decided_by: adminId,
      decided_at: new Date("2026-10-01"),
    },
  ];

  for (const e of entries) {
    const existing = await query(
      `SELECT id FROM decision_log WHERE subject = $1`,
      [e.subject]
    );
    if (existing.rows.length > 0) { log(`[skip] Decision Log entry exists: ${e.subject.slice(0, 60)}`); continue; }

    await query(
      `INSERT INTO decision_log (
         entry_type, subject, context, decision, rationale,
         alternatives_considered, assumptions, outcome,
         fiscal_year, reference_id, decided_by, decided_at, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        e.entry_type, e.subject, e.context || null, e.decision, e.rationale || null,
        e.alternatives_considered || null, e.assumptions || null, e.outcome || null,
        e.fiscal_year || null, e.reference_id || null,
        e.decided_by, e.decided_at, e.decided_by,
      ]
    );
    log(`Decision Log [${e.entry_type}]: ${e.subject.slice(0, 65)}`);
  }
}

// ── 7. Knowledge Documents ────────────────────────────────────────────────────

async function seedKnowledgeDocuments(users) {
  section("Knowledge Documents");

  const adminId   = users["admin@demo.edu"];
  const analystId = users["analyst@demo.edu"];

  const deptMap = {};
  const depts = await query(`SELECT id, code FROM departments`);
  depts.rows.forEach((d) => { deptMap[d.code] = d.id; });

  const docs = [
    {
      title: "FY27 Budget Development Policy & Guidelines",
      source_type: "Manual Entry",
      domain: "Budget Policy",
      dept: "FIN",
      submitted_by: adminId,
      status: "Approved",
      reviewed_by: adminId,
      content: `BUDGET DEVELOPMENT POLICY FY2027\n\nI. PURPOSE\nThis policy establishes the framework, calendar, and submission standards for the FY2027 annual budget development process for all departments.\n\nII. SUBMISSION REQUIREMENTS\nAll budget requests must include:\n1. Descriptive title and fiscal year designation\n2. Request type: operational, capital, staffing, grant, or other\n3. Cost type: one-time, recurring, or mixed\n4. Detailed justification (minimum 200 words)\n5. Strategic plan alignment reference\n6. Quantified impact description\n7. Base budget comparison\n\nIII. REVIEW THRESHOLDS\n- Under $50,000: Department VP approval\n- $50,000 – $249,999: Budget Analyst review + VP approval\n- $250,000 – $499,999: VP signature required, Budget Analyst review\n- $500,000 and above: Cabinet review required (30-day cycle)\n- $1,000,000 and above: Board notification required\n\nIV. SCORING CRITERIA\nAll submitted requests are scored by the AI analysis engine on seven dimensions: Strategic Alignment, Student Impact, Mandatory/Compliance Need, Operational Risk, Return on Investment, Accreditation/Compliance, and Workforce/Equity/Access. Scores are weighted and normalized to a 10-point scale.\n\nV. CALENDAR\n- September 1: Budget portal opens for submissions\n- October 31: Submission deadline\n- November 1-30: Review and scoring period\n- December 15: Preliminary allocations communicated\n- January 31: Final budget approved by Board`,
    },
    {
      title: "Strategic Plan 2025-2030: Institutional Priorities Summary",
      source_type: "Manual Entry",
      domain: "Strategic Planning",
      dept: "ACA",
      submitted_by: adminId,
      status: "Approved",
      reviewed_by: adminId,
      content: `STRATEGIC PLAN 2025-2030: PRIORITIES SUMMARY\n\nOUR MISSION: To provide accessible, high-quality education that empowers students to achieve their full potential and contribute to a diverse, global society.\n\nSTRATEGIC PRIORITY 1: STUDENT RETENTION & COMPLETION\nGoal: Reduce first-year attrition from 14% to 8% by FY2028.\nKey Initiatives: Academic advising expansion (1:250 ratio target), early alert system implementation, financial aid counseling expansion, peer mentoring program.\nBudget Impact: $2.1M projected additional tuition revenue per 2.3% retention improvement.\n\nSTRATEGIC PRIORITY 2: STUDENT SUCCESS THROUGH TECHNOLOGY\nGoal: Modernize digital learning infrastructure to support hybrid and online modality growth.\nKey Initiatives: LMS replacement (Canvas), classroom technology refresh (5-year cycle), student portal redesign, data analytics platform for Institutional Research.\n\nSTRATEGIC PRIORITY 3: INSTITUTIONAL RESILIENCE\nGoal: Strengthen cybersecurity posture, financial reserves, and operational continuity.\nKey Initiatives: Cybersecurity operations center, endpoint protection (CrowdStrike/SentinelOne), 90-day operating reserve target, business continuity planning.\n\nSTRATEGIC PRIORITY 4: SUSTAINABLE & SAFE CAMPUS\nGoal: Achieve carbon neutrality by 2035. Address 100% of Priority 1-2 deferred maintenance by FY28.\nKey Initiatives: LED lighting retrofit program, HVAC replacement cycle, renewable energy feasibility study, deferred maintenance elimination fund.\n\nSTRATEGIC PRIORITY 5: RESEARCH EXCELLENCE\nGoal: Grow sponsored research revenue from $4.8M to $8M by FY2028.\nKey Initiatives: Research instrumentation fund, grant writing support, shared instrumentation partnerships, PhD program development.\n\nSTRATEGIC PRIORITY 6: TALENT ATTRACTION & RETENTION\nGoal: Achieve top-quartile employee satisfaction by FY2027 (current: 2nd quartile).\nKey Initiatives: Employee wellness program expansion, competitive salary benchmarking, professional development fund, SHRM Best Places to Work certification.`,
    },
    {
      title: "Technology Procurement & Vendor Management Policy",
      source_type: "Manual Entry",
      domain: "IT Policy",
      dept: "IT",
      submitted_by: users["editor.it@demo.edu"],
      status: "Approved",
      reviewed_by: adminId,
      content: `TECHNOLOGY PROCUREMENT & VENDOR MANAGEMENT POLICY\n\nI. SCOPE\nApplies to all technology hardware, software, cloud services, and managed services with annual value over $5,000.\n\nII. PROCUREMENT PROCESS\n\nA. Under $25,000: Department IT liaison approval + IT security review (5 business days)\nB. $25,000 – $99,999: IT Director approval + security review + single-source justification if no competitive quotes (10 business days)\nC. $100,000 – $499,999: Full RFP process required (45 days minimum). At least 3 qualified vendors. Scoring rubric: 40% functionality, 25% TCO, 20% security/compliance, 15% support/SLA.\nD. $500,000 and above: RFP + Cabinet approval + independent cost analysis\n\nIII. SECURITY REQUIREMENTS\nAll cloud services must complete IT security assessment prior to contract execution. Assessment covers: data classification, encryption standards, SOC 2 Type II or FedRAMP compliance, incident notification SLA, and data residency requirements.\n\nIV. VENDOR MANAGEMENT\n- All software with access to student PII requires signed Data Processing Agreement (DPA)\n- Annual security questionnaire required for all Tier 1 vendors (annual contract value > $50K)\n- EDUCAUSE Higher Ed Community Vendor Assessment Toolkit (HECVAT) required for student data systems\n\nV. ASSET LIFECYCLE\nTechnology assets follow a defined lifecycle:\n- Workstations: 4-year refresh cycle\n- Servers: 5-year refresh cycle\n- Network core: 7-year refresh cycle\n- Classroom AV: 5-year refresh cycle\nEnd-of-Support (EOS) items may not remain in production without VP IT exception approval.`,
    },
    {
      title: "FY26 Annual Budget Report – Final Outcomes",
      source_type: "Manual Entry",
      domain: "Financial Reporting",
      dept: "FIN",
      submitted_by: analystId,
      status: "Approved",
      reviewed_by: adminId,
      content: `FY2026 ANNUAL BUDGET REPORT – FINAL OUTCOMES\n\nEXECUTIVE SUMMARY\nFY2026 closed with total revenue of $47.8M against total expenditures of $46.2M, resulting in a net operating surplus of $1.6M (3.3% margin). This exceeds the Board-approved target surplus of $1.0M.\n\nREVENUE SUMMARY\n- Tuition & Fees: $25.1M (+2.1% enrollment, +2.5% tuition = $1.4M increase over FY25)\n- State Appropriations: $14.2M (flat, as projected)\n- Grants & Contracts: $4.8M (+8.5% from new NIH awards)\n- Auxiliary & Other: $3.7M (athletics, housing, parking)\n- Total Revenue: $47.8M\n\nEXPENDITURE SUMMARY\n- Personnel (salaries + benefits): $29.4M (62% of total; 2.5% salary pool implemented)\n- Technology & Capital: $7.2M (includes $3.9M network infrastructure project)\n- Facilities & Operations: $5.8M ($87K unplanned HVAC emergency repairs)\n- Financial Aid: $2.6M\n- Other Operating: $1.2M\n- Total Expenditures: $46.2M\n\nKEY VARIANCES\n- HVAC Emergency Repairs: $87K over budget (not forecasted, now addressed in FY27 capital request)\n- Personnel under budget: $180K (3 positions open for part of year)\n- Technology over budget: $245K (accelerated classroom refresh Phase 1)\n\nFY27 IMPLICATIONS\nFY26 surplus of $1.6M: $800K directed to Capital Reserve (Science Building HVAC). $400K to Operating Reserve. $400K to Strategic Initiative Fund for advising expansion.`,
    },
    {
      title: "Human Resources Staffing & Compensation Framework",
      source_type: "Manual Entry",
      domain: "HR Policy",
      dept: "HR",
      submitted_by: users["editor.hr@demo.edu"],
      status: "Approved",
      reviewed_by: adminId,
      content: `HR STAFFING & COMPENSATION FRAMEWORK\n\nI. POSITION CLASSIFICATIONS\n\nA. Full-Time Equivalent (FTE) Categories:\n- Faculty: Tenured, Tenure-Track, Full-Time Visiting, Adjunct (0.5 FTE minimum for benefits)\n- Staff: Exempt (salaried), Non-Exempt (hourly), Temporary (< 6 months)\n- Graduate Assistants: Teaching, Research, Administrative\n\nII. SALARY BANDS (FY2027)\n- Grade 1 (Entry Support): $32,000 – $45,000\n- Grade 2 (Administrative): $42,000 – $58,000\n- Grade 3 (Professional): $55,000 – $78,000\n- Grade 4 (Senior Professional): $72,000 – $102,000\n- Grade 5 (Manager/Director): $95,000 – $145,000\n- Grade 6 (VP/Executive): $140,000 – $220,000\n\nIII. BENEFITS LOADING FACTOR\nFor budget planning purposes, the fully-loaded benefits rate is 32% of base salary. Breakdown: Health insurance (14%), Retirement (9%), FICA (7.65%), Other (1.35%).\n\nIV. NEW POSITION APPROVAL PROCESS\n1. Department submits Position Request Form with justification and budget impact\n2. HR confirms compensation band and market benchmarking (CUPA-HR data)\n3. VP approves positions under $100K fully loaded\n4. Cabinet approval required for positions over $100K or director/above level\n5. Budget Office confirms funding source before posting\n\nV. SALARY POOL GUIDELINES\n- FY2027 Merit Pool: 2.5% of total payroll\n- Distribution: Performance-based; 0% (needs improvement) to 5% (exceeds expectations)\n- Market adjustments (off-cycle): Requires VP + HR Director approval; limited to documented compression or turnover-risk cases`,
    },
  ];

  for (const d of docs) {
    const existing = await query(
      `SELECT id FROM knowledge_documents WHERE title = $1`,
      [d.title]
    );

    let docId;
    if (existing.rows.length > 0) {
      log(`[skip] Knowledge doc exists: ${d.title.slice(0, 60)}`);
      docId = existing.rows[0].id;
    } else {
      const res = await query(
        `INSERT INTO knowledge_documents (title, source_type, domain, department_id, submitted_by, status, reviewed_by, reviewed_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
         RETURNING id`,
        [
          d.title, d.source_type, d.domain,
          deptMap[d.dept], d.submitted_by, d.status,
          d.reviewed_by || null,
          JSON.stringify({ wordCount: d.content.split(" ").length, seedData: true }),
        ]
      );
      docId = res.rows[0].id;
      log(`Knowledge Doc: ${d.title.slice(0, 65)}`);
    }

    // Insert a single knowledge chunk (no embedding — use zeroed array for demo)
    // Real embedding requires OpenAI API call; seed with a zero vector for structure
    const chunkExists = await query(
      `SELECT id FROM knowledge_chunks WHERE document_id = $1 AND chunk_index = 0`,
      [docId]
    );
    if (chunkExists.rows.length === 0) {
      const zeroVector = new Array(1536).fill(0);
      await query(
        `INSERT INTO knowledge_chunks (document_id, chunk_index, content, token_count, embedding)
         VALUES ($1, 0, $2, $3, $4)`,
        [docId, d.content, Math.ceil(d.content.length / 4), `{${zeroVector.join(",")}}`]
      );
      log(`  └─ Chunk seeded for: ${d.title.slice(0, 55)}`);
    }
  }
}

// ── 8. Manual Reports ─────────────────────────────────────────────────────────

async function seedManualReports(users) {
  section("Manual Reports");

  const adminId   = users["admin@demo.edu"];
  const analystId = users["analyst@demo.edu"];

  const reports = [
    {
      user_id: analystId,
      title: "FY27 Budget Request Portfolio – Executive Summary",
      report_type: "budget_analysis",
      filters: { fiscalYear: "FY27", domain: "Budget Policy" },
      format: "txt",
      status: "Ready",
      word_count: 487,
      sources_used: 3,
      content: `FY27 BUDGET REQUEST PORTFOLIO – EXECUTIVE SUMMARY
Generated: ${new Date().toLocaleDateString()}

OVERVIEW
The FY2027 budget request cycle received 13 departmental submissions totaling $6.24M in requested funding across 8 departments. The portfolio reflects the institution's strategic priorities, with technology infrastructure and personnel investments comprising 58% of total requests.

PORTFOLIO STATISTICS
• Total Requests: 13
• Total Requested Amount: $6,244,000
• Approved: 4 requests ($1,593,000)
• Under Review: 3 requests ($685,000)
• Submitted (Pending Review): 2 requests ($287,000)
• On Hold: 1 request ($2,400,000)
• Denied: 1 request ($112,000)
• Draft: 2 requests ($377,000)

TOP REQUESTS BY AMOUNT
1. Student Orientation Center Phase 1 – $2,400,000 [ON HOLD pending capital campaign]
2. Science Building HVAC Replacement – $620,000 [APPROVED]
3. Research Mass Spectrometer – $475,000 [UNDER REVIEW]
4. Network Infrastructure (FY26) – $420,000 [APPROVED]
5. Classroom Technology Refresh – $310,000 [DRAFT]

AI SCORING INSIGHTS
Average AI confidence score across analyzed requests: 0.87 (high confidence)
Highest-scored request: Network Infrastructure (0.96 confidence)
Requests flagged for Cabinet review (>$500K): 3

RISK FLAGS
• IT Department: Total FY27 requests 47% above FY26 baseline — review recommended
• Research Dept: Mass spectrometer capital request 8.5x above 3-year average
• Facilities: Deferred maintenance HVAC requires Q4 FY26 resolution

RECOMMENDATIONS
1. Prioritize cybersecurity renewal (compliance-mandatory, insurance requirement)
2. Advance academic advisor staffing review — direct retention ROI documented
3. Hold orientation center pending capital campaign milestone ($1.6M gap)
4. Approve LED lighting retrofit — 3.6-year payback with utility rebate`,
    },
    {
      user_id: adminId,
      title: "Strategic Alignment Analysis – FY27 Requests vs. 2025-2030 Plan",
      report_type: "strategic_analysis",
      filters: { fiscalYear: "FY27", domain: "Strategic Planning" },
      format: "txt",
      status: "Ready",
      word_count: 312,
      sources_used: 2,
      content: `STRATEGIC ALIGNMENT ANALYSIS – FY27 BUDGET REQUESTS
Against Strategic Plan 2025-2030

PRIORITY COVERAGE MAP

Strategic Priority 1 (Student Retention): 2 requests
  → Academic Advisor Expansion ($340K) — DIRECT alignment
  → Financial Aid Counselors FY26 ($168K) — DIRECT alignment

Strategic Priority 2 (Technology): 4 requests
  → LMS Canvas Replacement ($285K) — DIRECT alignment
  → Classroom Technology Refresh ($310K) — DIRECT alignment
  → Data Analytics Platform ($67K) — DIRECT alignment
  → Cybersecurity Renewal ($118K) — SUPPORTING alignment

Strategic Priority 3 (Resilience): 1 request
  → Cybersecurity Operations ($118K) — DIRECT alignment

Strategic Priority 4 (Sustainability): 2 requests
  → LED Lighting Retrofit ($195K) — DIRECT alignment
  → HVAC Replacement ($620K) — DIRECT alignment

Strategic Priority 5 (Research): 1 request
  → Mass Spectrometer ($475K) — DIRECT alignment

Strategic Priority 6 (Talent): 1 request
  → Employee Wellness Expansion ($92K) — DIRECT alignment

GAPS IDENTIFIED
No requests received addressing: online program expansion (Priority 2), carbon neutrality renewable energy (Priority 4), or PhD program development (Priority 5).

OVERALL ALIGNMENT SCORE: 91% of submitted requests align with at least one strategic priority.`,
    },
  ];

  for (const r of reports) {
    const existing = await query(
      `SELECT id FROM manual_reports WHERE title = $1`,
      [r.title]
    );
    if (existing.rows.length > 0) { log(`[skip] Manual report exists: ${r.title.slice(0, 60)}`); continue; }

    await query(
      `INSERT INTO manual_reports (user_id, title, report_type, filters, content, status, format, word_count, sources_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [r.user_id, r.title, r.report_type, JSON.stringify(r.filters), r.content, r.status, r.format, r.word_count, r.sources_used]
    );
    log(`Manual Report: ${r.title.slice(0, 65)}`);
  }
}

// ── Main (PRODUCTION SAFE – skips departments & users) ───────────────────────

async function main() {
  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log("║   Budget AI Assistant – Production Content Seed    ║");
  console.log("╚════════════════════════════════════════════════════╝");
  console.log("\n⚠  PRODUCTION MODE: Skipping departments and users.");
  console.log("   Uses existing admin/analyst accounts from the DB.\n");

  // Resolve an existing Admin user and Budget Analyst from production DB
  const adminRes = await pool.query(
    `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'Admin' AND u.is_active = true ORDER BY u.created_at LIMIT 1`
  );
  const analystRes = await pool.query(
    `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name IN ('Admin','Budget Analyst') AND u.is_active = true ORDER BY u.created_at LIMIT 1`
  );

  if (!adminRes.rows[0]) {
    console.error("❌ No active Admin user found in production DB. Aborting.");
    process.exit(1);
  }

  // Build a minimal users map using real production user IDs
  const prodAdminId   = adminRes.rows[0].id;
  const prodAnalystId = analystRes.rows[0]?.id || prodAdminId;

  // Get first department of each type for linking
  const deptRes = await pool.query(`SELECT id, name, code FROM departments ORDER BY id`);
  const deptByCode = {};
  deptRes.rows.forEach((d) => { deptByCode[d.code] = d.id; });

  // Build fake users map pointing to real prod admin for all roles
  const users = {
    "admin@demo.edu":       prodAdminId,
    "analyst@demo.edu":     prodAnalystId,
    "editor.it@demo.edu":   prodAdminId,
    "editor.acad@demo.edu": prodAdminId,
    "editor.fac@demo.edu":  prodAdminId,
    "editor.res@demo.edu":  prodAdminId,
    "editor.hr@demo.edu":   prodAdminId,
  };

  try {
    // Safe content: scenarios, decision log, knowledge docs, manual reports
    await seedScenarios(users);
    await seedKnowledgeDocuments(users);
    await seedManualReports(users);

    console.log("\n╔════════════════════════════════════════════════════╗");
    console.log("║   ✅ Production seed complete!                      ║");
    console.log("╚════════════════════════════════════════════════════╝");
    console.log("\n📦 DATA ADDED TO PRODUCTION");
    console.log("─────────────────────────────────────────────────────");
    console.log("  5   Budget Scenarios (Best/Expected/Constrained/Custom + FY26)");
    console.log("  5   Knowledge Documents (approved, with chunks)");
    console.log("  2   Manual Reports (ready to view)");
    console.log("\n  ✅ Existing documents, users, and departments untouched.");
    console.log("\n  ⚠  Knowledge document chunks use zero embeddings.");
    console.log("     Re-ingest them via Knowledge panel for real AI search.\n");
  } catch (err) {
    console.error("\n❌ Seed failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
