import { pool } from "../../config/db.js";

function normalizeSteps(steps) {
  return (steps || []).map((step, index) => ({
    key: step.key.trim(),
    title: step.title.trim(),
    meaning: step.meaning.trim(),
    placeholder: (step.placeholder || "").trim(),
    value: (step.value || "").trim(),
    done: Boolean(step.done),
    order: Number.isFinite(Number(step.order)) ? Number(step.order) : index + 1
  }));
}

async function resolveDepartment(client, payload) {
  if (payload.departmentId != null) {
    const result = await client.query("SELECT id, name, code FROM departments WHERE id = $1", [payload.departmentId]);
    if (result.rowCount === 0) {
      const error = new Error("Department not found");
      error.statusCode = 404;
      throw error;
    }
    return result.rows[0];
  }

  if (payload.departmentCode) {
    const result = await client.query("SELECT id, name, code FROM departments WHERE upper(code) = upper($1)", [
      payload.departmentCode
    ]);
    if (result.rowCount === 0) {
      const error = new Error("Department not found");
      error.statusCode = 404;
      throw error;
    }
    return result.rows[0];
  }

  if (payload.departmentName) {
    const result = await client.query("SELECT id, name, code FROM departments WHERE lower(name) = lower($1)", [
      payload.departmentName
    ]);
    if (result.rowCount === 0) {
      const error = new Error("Department not found");
      error.statusCode = 404;
      throw error;
    }
    return result.rows[0];
  }

  const error = new Error("Department identifier is required");
  error.statusCode = 400;
  throw error;
}

async function getNextAgentCode(client) {
  const result = await client.query(
    `SELECT code
     FROM agent_configurations
     WHERE code ~ '^AG[0-9]+$'
     ORDER BY CAST(SUBSTRING(code FROM 3) AS INTEGER) DESC
     LIMIT 1`
  );

  if (result.rowCount === 0) {
    return "AG001";
  }

  const current = Number(result.rows[0].code.slice(2));
  const next = Number.isFinite(current) ? current + 1 : 1;
  return `AG${String(next).padStart(3, "0")}`;
}

async function ensureAgent(client, agentId) {
  const result = await client.query(
    `SELECT ac.id, ac.department_id, ac.name, d.name AS department, d.code AS department_code
     FROM agent_configurations ac
     JOIN departments d ON d.id = ac.department_id
     WHERE ac.id = $1`,
    [agentId]
  );

  if (result.rowCount === 0) {
    const error = new Error("Agent configuration not found");
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
}

async function replaceAssignmentsTx(client, agentId, departmentId, appliesToAll, userIds = []) {
  await client.query("UPDATE agent_configurations SET applies_to_all = $1 WHERE id = $2", [appliesToAll, agentId]);
  await client.query("DELETE FROM agent_configuration_assignments WHERE agent_id = $1", [agentId]);

  if (appliesToAll) {
    return;
  }

  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length === 0) {
    return;
  }

  const users = await client.query(
    `SELECT id
     FROM users
     WHERE id = ANY($1::uuid[])
       AND department_id = $2`,
    [uniqueUserIds, departmentId]
  );

  if (users.rowCount !== uniqueUserIds.length) {
    const error = new Error("One or more selected users are invalid for this department");
    error.statusCode = 400;
    throw error;
  }

  for (const userId of uniqueUserIds) {
    await client.query(
      `INSERT INTO agent_configuration_assignments (agent_id, user_id)
       VALUES ($1, $2)`,
      [agentId, userId]
    );
  }
}

async function replaceStepsTx(client, agentId, steps) {
  const normalized = normalizeSteps(steps);
  if (!normalized.length) {
    return;
  }

  const keys = normalized.map((step) => step.key);
  await client.query(
    `DELETE FROM agent_configuration_steps
     WHERE agent_id = $1
       AND step_key <> ALL($2::text[])`,
    [agentId, keys]
  );

  for (const step of normalized) {
    await client.query(
      `INSERT INTO agent_configuration_steps (agent_id, step_key, step_order, title, meaning, placeholder, content, is_done)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (agent_id, step_key)
       DO UPDATE SET
         step_order = EXCLUDED.step_order,
         title = EXCLUDED.title,
         meaning = EXCLUDED.meaning,
         placeholder = EXCLUDED.placeholder,
         content = EXCLUDED.content,
         is_done = EXCLUDED.is_done,
         updated_at = now()`,
      [agentId, step.key, step.order, step.title, step.meaning, step.placeholder, step.value, step.done]
    );
  }
}

async function listConfigurationsByIds(client, agentIds) {
  if (!agentIds.length) {
    return [];
  }

  const configsResult = await client.query(
    `SELECT ac.id, ac.code, ac.name, ac.applies_to_all, ac.scope, ac.risk_language, ac.is_active, ac.created_at, ac.updated_at,
            d.id AS department_id, d.name AS department, d.code AS department_code
     FROM agent_configurations ac
     JOIN departments d ON d.id = ac.department_id
     WHERE ac.id = ANY($1::uuid[])
     ORDER BY ac.created_at DESC`,
    [agentIds]
  );

  const assignmentsResult = await client.query(
    `SELECT a.agent_id, a.user_id, u.name AS user_name, u.email AS user_email
     FROM agent_configuration_assignments a
     JOIN users u ON u.id = a.user_id
     WHERE a.agent_id = ANY($1::uuid[])
     ORDER BY u.name ASC`,
    [agentIds]
  );

  const stepsResult = await client.query(
    `SELECT agent_id, step_key, step_order, title, meaning, placeholder, content, is_done
     FROM agent_configuration_steps
     WHERE agent_id = ANY($1::uuid[])
     ORDER BY step_order ASC`,
    [agentIds]
  );

  const assignmentsByAgent = new Map();
  for (const row of assignmentsResult.rows) {
    if (!assignmentsByAgent.has(row.agent_id)) {
      assignmentsByAgent.set(row.agent_id, []);
    }
    assignmentsByAgent.get(row.agent_id).push({
      userId: row.user_id,
      name: row.user_name,
      email: row.user_email
    });
  }

  const stepsByAgent = new Map();
  for (const row of stepsResult.rows) {
    if (!stepsByAgent.has(row.agent_id)) {
      stepsByAgent.set(row.agent_id, []);
    }
    stepsByAgent.get(row.agent_id).push({
      key: row.step_key,
      order: row.step_order,
      title: row.title,
      meaning: row.meaning,
      placeholder: row.placeholder,
      value: row.content,
      done: row.is_done
    });
  }

  return configsResult.rows.map((row) => {
    const assignments = assignmentsByAgent.get(row.id) || [];
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      departmentId: row.department_id,
      department: row.department,
      departmentCode: row.department_code,
      appliesToAll: row.applies_to_all,
      scope: row.scope,
      riskLanguage: row.risk_language,
      isActive: row.is_active,
      selectedUserIds: assignments.map((assignment) => assignment.userId),
      assignedUsers: assignments,
      steps: stepsByAgent.get(row.id) || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
}

async function getConfigurationById(client, agentId) {
  const items = await listConfigurationsByIds(client, [agentId]);
  if (!items.length) {
    const error = new Error("Agent configuration not found");
    error.statusCode = 404;
    throw error;
  }

  return items[0];
}

export async function listAgentConfigurations({ departmentCode, isActive } = {}) {
  const filters = [];
  const values = [];

  if (departmentCode) {
    values.push(departmentCode);
    filters.push(`upper(d.code) = upper($${values.length})`);
  }

  if (isActive !== undefined) {
    values.push(isActive);
    filters.push(`ac.is_active = $${values.length}`);
  }

  const whereClause = filters.length
    ? `WHERE ${filters.join(" AND ")}`
    : "";

  const result = await pool.query(
    `SELECT ac.id
     FROM agent_configurations ac
     JOIN departments d ON d.id = ac.department_id
     ${whereClause}
     ORDER BY ac.created_at DESC`,
    values
  );

  const ids = result.rows.map((row) => row.id);
  return listConfigurationsByIds(pool, ids);
}

export async function getAgentConfiguration(agentId) {
  const client = await pool.connect();
  try {
    return await getConfigurationById(client, agentId);
  } finally {
    client.release();
  }
}

export async function createAgentConfiguration(payload, createdByUserId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const department = await resolveDepartment(client, payload);
    const code = await getNextAgentCode(client);

    const inserted = await client.query(
      `INSERT INTO agent_configurations (code, name, department_id, applies_to_all, scope, risk_language, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        code,
        payload.name.trim(),
        department.id,
        payload.appliesToAll !== false,
        payload.scope?.trim() || `Guidance-only assistant for ${department.name} budget workflows.`,
        payload.riskLanguage?.trim() || "I may be uncertain. Please confirm with Budget Office before final action.",
        createdByUserId
      ]
    );

    const agentId = inserted.rows[0].id;

    await replaceAssignmentsTx(
      client,
      agentId,
      department.id,
      payload.appliesToAll !== false,
      payload.userIds || []
    );

    if (payload.steps?.length) {
      await replaceStepsTx(client, agentId, payload.steps);
    }

    const config = await getConfigurationById(client, agentId);

    await client.query("COMMIT");
    return config;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAgentConfiguration(agentId, payload) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existing = await ensureAgent(client, agentId);

    const updates = [];
    const values = [];

    if (payload.name) {
      values.push(payload.name.trim());
      updates.push(`name = $${values.length}`);
    }

    if (
      payload.departmentId != null ||
      payload.departmentCode != null ||
      payload.departmentName != null
    ) {
      const department = await resolveDepartment(client, payload);
      values.push(department.id);
      updates.push(`department_id = $${values.length}`);

      if (department.id !== existing.department_id) {
        await client.query("DELETE FROM agent_configuration_assignments WHERE agent_id = $1", [agentId]);
        values.push(true);
        updates.push(`applies_to_all = $${values.length}`);
      }
    }

    if (typeof payload.appliesToAll === "boolean") {
      values.push(payload.appliesToAll);
      updates.push(`applies_to_all = $${values.length}`);
    }

    if (typeof payload.isActive === "boolean") {
      values.push(payload.isActive);
      updates.push(`is_active = $${values.length}`);
    }

    if (payload.scope != null) {
      values.push(payload.scope.trim());
      updates.push(`scope = $${values.length}`);
    }

    if (payload.riskLanguage != null) {
      values.push(payload.riskLanguage.trim());
      updates.push(`risk_language = $${values.length}`);
    }

    if (!updates.length) {
      const error = new Error("No updatable fields provided");
      error.statusCode = 400;
      throw error;
    }

    values.push(agentId);
    await client.query(
      `UPDATE agent_configurations
       SET ${updates.join(", ")}, updated_at = now()
       WHERE id = $${values.length}`,
      values
    );

    const config = await getConfigurationById(client, agentId);
    await client.query("COMMIT");
    return config;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function replaceAgentAssignments(agentId, payload) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existing = await ensureAgent(client, agentId);
    await replaceAssignmentsTx(
      client,
      agentId,
      existing.department_id,
      payload.appliesToAll,
      payload.userIds || []
    );

    const config = await getConfigurationById(client, agentId);
    await client.query("COMMIT");
    return config;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function replaceAgentSteps(agentId, steps) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureAgent(client, agentId);
    await replaceStepsTx(client, agentId, steps);
    const config = await getConfigurationById(client, agentId);
    await client.query("COMMIT");
    return config;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAgentConfiguration(agentId) {
  const result = await pool.query("DELETE FROM agent_configurations WHERE id = $1 RETURNING id", [agentId]);

  if (result.rowCount === 0) {
    const error = new Error("Agent configuration not found");
    error.statusCode = 404;
    throw error;
  }

  return { id: result.rows[0].id };
}
