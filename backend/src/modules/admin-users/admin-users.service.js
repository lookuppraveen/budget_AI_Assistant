import { pool } from "../../config/db.js";

export async function listAdminUsers() {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.is_active,
            r.name AS role,
            d.name AS department,
            d.code AS department_code,
            u.created_at, u.updated_at
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN departments d ON d.id = u.department_id
     ORDER BY u.created_at DESC`
  );

  return result.rows;
}

export async function updateAdminUser(userId, payload) {
  const updates = [];
  const values = [];

  if (payload.role) {
    const roleResult = await pool.query("SELECT id FROM roles WHERE name = $1", [payload.role]);
    if (roleResult.rowCount === 0) {
      const error = new Error("Invalid role");
      error.statusCode = 400;
      throw error;
    }

    values.push(roleResult.rows[0].id);
    updates.push(`role_id = $${values.length}`);
  }

  if (typeof payload.isActive === "boolean") {
    values.push(payload.isActive);
    updates.push(`is_active = $${values.length}`);
  }

  if (payload.departmentCode) {
    const departmentResult = await pool.query("SELECT id FROM departments WHERE upper(code) = upper($1)", [
      payload.departmentCode
    ]);

    if (departmentResult.rowCount === 0) {
      const error = new Error("Invalid department code");
      error.statusCode = 400;
      throw error;
    }

    values.push(departmentResult.rows[0].id);
    updates.push(`department_id = $${values.length}`);
  }

  if (updates.length === 0) {
    const error = new Error("No updatable fields provided");
    error.statusCode = 400;
    throw error;
  }

  values.push(userId);

  const result = await pool.query(
    `UPDATE users
     SET ${updates.join(", ")}, updated_at = now()
     WHERE id = $${values.length}
     RETURNING id`,
    values
  );

  if (result.rowCount === 0) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const refreshed = await pool.query(
    `SELECT u.id, u.name, u.email, u.is_active,
            r.name AS role,
            d.name AS department,
            d.code AS department_code,
            u.created_at, u.updated_at
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN departments d ON d.id = u.department_id
     WHERE u.id = $1`,
    [userId]
  );

  return refreshed.rows[0];
}