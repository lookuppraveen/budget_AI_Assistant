import { pool } from "../../config/db.js";

export async function listDepartments() {
  const result = await pool.query(
    `SELECT id, name, code, owner, created_at, updated_at
     FROM departments
     ORDER BY name ASC`
  );

  return result.rows;
}

export async function createDepartment({ name, code, owner }) {
  const result = await pool.query(
    `INSERT INTO departments (name, code, owner)
     VALUES ($1, upper($2), $3)
     RETURNING id, name, code, owner, created_at, updated_at`,
    [name.trim(), code.trim(), owner?.trim() || null]
  );

  return result.rows[0];
}

export async function updateDepartment(departmentId, payload) {
  const updates = [];
  const values = [];

  if (payload.name) {
    values.push(payload.name.trim());
    updates.push(`name = $${values.length}`);
  }

  if (payload.code) {
    values.push(payload.code.trim().toUpperCase());
    updates.push(`code = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "owner")) {
    values.push(payload.owner?.trim() || null);
    updates.push(`owner = $${values.length}`);
  }

  if (updates.length === 0) {
    const error = new Error("No updatable fields provided");
    error.statusCode = 400;
    throw error;
  }

  values.push(departmentId);

  const result = await pool.query(
    `UPDATE departments
     SET ${updates.join(", ")}, updated_at = now()
     WHERE id = $${values.length}
     RETURNING id, name, code, owner, created_at, updated_at`,
    values
  );

  if (result.rowCount === 0) {
    const error = new Error("Department not found");
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
}

export async function deleteDepartment(departmentId) {
  const usage = await pool.query(
    `SELECT
        (SELECT COUNT(*) FROM users WHERE department_id = $1)::int AS user_count,
        (SELECT COUNT(*) FROM knowledge_documents WHERE department_id = $1)::int AS document_count`,
    [departmentId]
  );

  const row = usage.rows[0];
  if (row.user_count > 0 || row.document_count > 0) {
    const error = new Error(
      `Department is in use by ${row.user_count} users and ${row.document_count} documents. Reassign records before delete.`
    );
    error.statusCode = 409;
    throw error;
  }

  const result = await pool.query("DELETE FROM departments WHERE id = $1 RETURNING id", [departmentId]);

  if (result.rowCount === 0) {
    const error = new Error("Department not found");
    error.statusCode = 404;
    throw error;
  }

  return { id: result.rows[0].id };
}
