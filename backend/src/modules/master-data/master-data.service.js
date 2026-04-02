import { pool } from "../../config/db.js";

export async function listMasterData() {
  const result = await pool.query(
    `SELECT t.id AS type_id, t.name AS type_name, t.is_active AS type_active,
            v.id AS value_id, v.value, v.is_active AS value_active
     FROM master_data_types t
     LEFT JOIN master_data_values v ON v.type_id = t.id
     ORDER BY t.name ASC, v.value ASC`
  );

  const byType = new Map();

  for (const row of result.rows) {
    if (!byType.has(row.type_name)) {
      byType.set(row.type_name, {
        id: row.type_id,
        name: row.type_name,
        isActive: row.type_active,
        values: []
      });
    }

    if (row.value_id) {
      byType.get(row.type_name).values.push({
        id: row.value_id,
        value: row.value,
        isActive: row.value_active
      });
    }
  }

  return Array.from(byType.values());
}

export async function createMasterType(name) {
  const result = await pool.query(
    `INSERT INTO master_data_types (name)
     VALUES ($1)
     RETURNING id, name, is_active`,
    [name.trim()]
  );

  return {
    id: result.rows[0].id,
    name: result.rows[0].name,
    isActive: result.rows[0].is_active,
    values: []
  };
}

export async function updateMasterType(typeId, name) {
  const result = await pool.query(
    `UPDATE master_data_types
     SET name = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, name, is_active`,
    [name.trim(), typeId]
  );

  if (result.rowCount === 0) {
    const error = new Error("Master data type not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    id: result.rows[0].id,
    name: result.rows[0].name,
    isActive: result.rows[0].is_active
  };
}

export async function deleteMasterType(typeId) {
  const result = await pool.query("DELETE FROM master_data_types WHERE id = $1 RETURNING id", [typeId]);

  if (result.rowCount === 0) {
    const error = new Error("Master data type not found");
    error.statusCode = 404;
    throw error;
  }

  return { id: result.rows[0].id };
}

export async function createMasterValue(typeName, value) {
  const type = await pool.query("SELECT id FROM master_data_types WHERE lower(name) = lower($1)", [typeName]);

  if (type.rowCount === 0) {
    const error = new Error("Master data type not found");
    error.statusCode = 404;
    throw error;
  }

  const result = await pool.query(
    `INSERT INTO master_data_values (type_id, value)
     VALUES ($1, $2)
     RETURNING id, value, is_active`,
    [type.rows[0].id, value.trim()]
  );

  return {
    id: result.rows[0].id,
    value: result.rows[0].value,
    isActive: result.rows[0].is_active
  };
}

export async function updateMasterValue(valueId, value) {
  const result = await pool.query(
    `UPDATE master_data_values
     SET value = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, value, is_active`,
    [value.trim(), valueId]
  );

  if (result.rowCount === 0) {
    const error = new Error("Master data value not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    id: result.rows[0].id,
    value: result.rows[0].value,
    isActive: result.rows[0].is_active
  };
}

export async function deleteMasterValue(valueId) {
  const result = await pool.query("DELETE FROM master_data_values WHERE id = $1 RETURNING id", [valueId]);

  if (result.rowCount === 0) {
    const error = new Error("Master data value not found");
    error.statusCode = 404;
    throw error;
  }

  return { id: result.rows[0].id };
}
