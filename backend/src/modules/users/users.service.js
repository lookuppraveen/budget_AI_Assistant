import { pool } from "../../config/db.js";

export async function listUsers() {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.is_active,
            r.name AS role,
            d.name AS department,
            d.code AS department_code,
            u.created_at
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN departments d ON d.id = u.department_id
     ORDER BY u.created_at DESC`
  );

  return result.rows;
}