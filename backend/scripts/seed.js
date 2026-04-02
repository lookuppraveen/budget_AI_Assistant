import bcrypt from "bcryptjs";
import { pool } from "../src/config/db.js";

async function run() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const roles = ["Admin", "Budget Analyst", "Department Editor", "Read Only"];
    for (const role of roles) {
      await client.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [role]);
    }

    const departments = [
      ["Budget Office", "BUD", "VP Finance"],
      ["Finance", "FIN", "Controller"],
      ["Academic Affairs", "ACA", "Provost"],
      ["Student Services", "STD", "VP Student Affairs"]
    ];

    for (const [name, code, owner] of departments) {
      await client.query(
        "INSERT INTO departments (name, code, owner) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING",
        [name, code, owner]
      );
    }

    const roleResult = await client.query("SELECT id FROM roles WHERE name = 'Admin'");
    const deptResult = await client.query("SELECT id FROM departments WHERE code = 'BUD'");

    const adminEmail = "admin@stlcc.edu";
    const adminPassword = "Admin@12345";
    const hash = await bcrypt.hash(adminPassword, 12);

    await client.query(
      `INSERT INTO users (name, email, password_hash, role_id, department_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (email) DO NOTHING`,
      ["System Admin", adminEmail, hash, roleResult.rows[0].id, deptResult.rows[0].id]
    );

    const adminResult = await client.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
    const financeDept = await client.query("SELECT id FROM departments WHERE code = 'FIN'");

    await client.query(
      `INSERT INTO knowledge_documents (title, source_type, domain, department_id, submitted_by, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb),
              ($8, $9, $10, $11, $12, $13, $14::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        "FY26 Operating Budget Guidelines.pdf",
        "SharePoint",
        "Budget Policies",
        deptResult.rows[0].id,
        adminResult.rows[0].id,
        "Approved",
        JSON.stringify({ sourcePath: "Shared Documents/FY26" }),
        "Banner Workflow Transcript",
        "Transcript",
        "Budget Training Materials",
        financeDept.rows[0].id,
        adminResult.rows[0].id,
        "Hold",
        JSON.stringify({ sourcePath: "Training Archive" })
      ]
    );

    await client.query(
      `INSERT INTO report_runs (report_name, owner, frequency, status)
       VALUES ($1, $2, $3, $4),
              ($5, $6, $7, $8),
              ($9, $10, $11, $12),
              ($13, $14, $15, $16)`,
      [
        "Monthly Budget Q&A Effectiveness",
        "Budget Office",
        "Monthly",
        "Ready",
        "Department Knowledge Coverage",
        "Planning Team",
        "Weekly",
        "Draft",
        "Low-Confidence Escalation Log",
        "Risk & Compliance",
        "Daily",
        "Ready",
        "Email Assistant Turnaround Report",
        "Operations",
        "Weekly",
        "Scheduled"
      ]
    );

    await client.query("COMMIT");
    console.log("Seed complete");
    console.log(`Admin email: ${adminEmail}`);
    console.log(`Admin password: ${adminPassword}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seed failed", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
