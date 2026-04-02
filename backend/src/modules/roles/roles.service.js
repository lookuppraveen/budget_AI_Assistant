import { pool } from "../../config/db.js";

const systemRoles = new Set(["Admin", "Budget Analyst", "Department Editor", "Read Only"]);
let rolesColumnsCache = null;

function isSystemRole(roleName) {
  return systemRoles.has(roleName);
}

async function getRolesColumns() {
  if (rolesColumnsCache) {
    return rolesColumnsCache;
  }

  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'roles'`
  );

  const columns = new Set(result.rows.map((row) => row.column_name));
  rolesColumnsCache = {
    hasIsActive: columns.has("is_active"),
    hasUpdatedAt: columns.has("updated_at")
  };

  return rolesColumnsCache;
}

export const availablePermissions = [
  "Master Data",
  "Users",
  "Roles",
  "Departments",
  "Audit",
  "Documents",
  "Wizard",
  "Knowledge",
  "Email",
  "Reports",
  "Requests"
];

export async function listRoles() {
  const { hasIsActive } = await getRolesColumns();
  const sql = hasIsActive
    ? `SELECT r.id, r.name, r.is_active,
              COUNT(u.id) FILTER (WHERE u.is_active = true) AS active_users
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.id
       GROUP BY r.id, r.name, r.is_active
       ORDER BY r.name ASC`
    : `SELECT r.id, r.name, true AS is_active,
              COUNT(u.id) FILTER (WHERE u.is_active = true) AS active_users
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.id
       GROUP BY r.id, r.name
       ORDER BY r.name ASC`;

  const result = await pool.query(sql);

  return result.rows.map((row) => ({
    ...row,
    is_system: isSystemRole(row.name)
  }));
}

export async function listRolePermissions() {
  const roles = await listRoles();
  const result = await pool.query(
    `SELECT r.name AS role_name, rp.permission_key
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     ORDER BY r.name ASC, rp.permission_key ASC`
  );

  const byRole = new Map(roles.map((role) => [role.name, []]));
  for (const row of result.rows) {
    if (row.permission_key) {
      byRole.get(row.role_name)?.push(row.permission_key);
    }
  }

  return roles.map((role) => ({
    id: role.name,
    users: Number(role.active_users || 0),
    permissions: byRole.get(role.name) || [],
    isActive: role.is_active,
    isSystem: role.is_system
  }));
}

export async function createRole(name) {
  const { hasIsActive } = await getRolesColumns();
  const trimmed = name.trim();
  const sql = hasIsActive
    ? `INSERT INTO roles (name, is_active)
       VALUES ($1, true)
       RETURNING id, name, is_active`
    : `INSERT INTO roles (name)
       VALUES ($1)
       RETURNING id, name, true AS is_active`;
  const result = await pool.query(sql, [trimmed]);

  return {
    id: result.rows[0].id,
    name: result.rows[0].name,
    isActive: result.rows[0].is_active,
    isSystem: isSystemRole(result.rows[0].name)
  };
}

export async function updateRole(roleName, payload) {
  const { hasIsActive, hasUpdatedAt } = await getRolesColumns();
  const current = await pool.query(
    hasIsActive
      ? "SELECT id, name, is_active FROM roles WHERE name = $1"
      : "SELECT id, name, true AS is_active FROM roles WHERE name = $1",
    [roleName]
  );
  if (current.rowCount === 0) {
    const error = new Error("Role not found");
    error.statusCode = 404;
    throw error;
  }

  const currentRole = current.rows[0];
  if (isSystemRole(currentRole.name)) {
    if (payload.name && payload.name.trim() !== currentRole.name) {
      const error = new Error("System role names cannot be changed");
      error.statusCode = 400;
      throw error;
    }

    if (typeof payload.isActive === "boolean" && payload.isActive === false) {
      const error = new Error("System roles cannot be deactivated");
      error.statusCode = 400;
      throw error;
    }
  }

  const updates = [];
  const values = [];

  if (payload.name) {
    values.push(payload.name.trim());
    updates.push(`name = $${values.length}`);
  }

  if (typeof payload.isActive === "boolean") {
    if (!hasIsActive) {
      const error = new Error("Role active status is unavailable until latest migration is applied.");
      error.statusCode = 400;
      throw error;
    }

    values.push(payload.isActive);
    updates.push(`is_active = $${values.length}`);
  }

  if (updates.length === 0) {
    const error = new Error("No updatable fields provided");
    error.statusCode = 400;
    throw error;
  }

  values.push(currentRole.id);

  const sql = `UPDATE roles
     SET ${updates.join(", ")}${hasUpdatedAt ? ", updated_at = now()" : ""}
     WHERE id = $${values.length}
     RETURNING id, name, ${hasIsActive ? "is_active" : "true AS is_active"}`;
  const result = await pool.query(sql, values);

  return {
    id: result.rows[0].id,
    name: result.rows[0].name,
    isActive: result.rows[0].is_active,
    isSystem: isSystemRole(result.rows[0].name)
  };
}

export async function deleteRole(roleName) {
  const current = await pool.query("SELECT id, name FROM roles WHERE name = $1", [roleName]);
  if (current.rowCount === 0) {
    const error = new Error("Role not found");
    error.statusCode = 404;
    throw error;
  }

  const role = current.rows[0];
  if (isSystemRole(role.name)) {
    const error = new Error("System roles cannot be deleted");
    error.statusCode = 400;
    throw error;
  }

  const users = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role_id = $1", [role.id]);
  if (users.rows[0].count > 0) {
    const error = new Error(`Role is assigned to ${users.rows[0].count} users. Reassign users before delete.`);
    error.statusCode = 409;
    throw error;
  }

  await pool.query("DELETE FROM roles WHERE id = $1", [role.id]);
  return { name: role.name };
}

export async function updateRolePermissions(roleName, permissions) {
  const role = await pool.query("SELECT id, name FROM roles WHERE name = $1", [roleName]);
  if (role.rowCount === 0) {
    const error = new Error("Role not found");
    error.statusCode = 404;
    throw error;
  }

  const roleId = role.rows[0].id;
  const nextPermissions = [...new Set(permissions)].filter((permission) => availablePermissions.includes(permission));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM role_permissions WHERE role_id = $1", [roleId]);

    for (const permission of nextPermissions) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_key)
         VALUES ($1, $2)`,
        [roleId, permission]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    role: role.rows[0].name,
    permissions: nextPermissions
  };
}
