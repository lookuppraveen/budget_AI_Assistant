import { requestApi } from "./httpClient.js";

export async function getAdminUsers(token) {
  return requestApi("/admin/users", { token });
}

export async function updateAdminUser(token, userId, payload) {
  return requestApi(`/admin/users/${userId}`, {
    token,
    options: {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  });
}

export async function getRoles(token) {
  return requestApi("/roles", { token });
}

export async function createRole(token, payload) {
  return requestApi("/roles", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify(payload)
    }
  });
}

export async function updateRole(token, roleName, payload) {
  return requestApi(`/roles/${encodeURIComponent(roleName)}`, {
    token,
    options: {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  });
}

export async function deleteRole(token, roleName) {
  return requestApi(`/roles/${encodeURIComponent(roleName)}`, {
    token,
    options: {
      method: "DELETE"
    }
  });
}

export async function getRolePermissions(token) {
  return requestApi("/roles/permissions", { token });
}

export async function updateRolePermissions(token, roleName, permissions) {
  return requestApi(`/roles/${encodeURIComponent(roleName)}/permissions`, {
    token,
    options: {
      method: "PATCH",
      body: JSON.stringify({ permissions })
    }
  });
}

export async function getDepartments(token) {
  return requestApi("/departments", { token });
}

export async function createDepartment(token, payload) {
  return requestApi("/departments", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify(payload)
    }
  });
}

export async function updateDepartment(token, departmentId, payload) {
  return requestApi(`/departments/${departmentId}`, {
    token,
    options: {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  });
}

export async function deleteDepartment(token, departmentId) {
  return requestApi(`/departments/${departmentId}`, {
    token,
    options: {
      method: "DELETE"
    }
  });
}

export async function getMasterData(token) {
  return requestApi("/master-data", { token });
}

export async function createMasterType(token, payload) {
  return requestApi("/master-data/types", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify(payload)
    }
  });
}

export async function updateMasterType(token, typeId, payload) {
  return requestApi(`/master-data/types/${typeId}`, {
    token,
    options: {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  });
}

export async function deleteMasterType(token, typeId) {
  return requestApi(`/master-data/types/${typeId}`, {
    token,
    options: {
      method: "DELETE"
    }
  });
}

export async function createMasterValue(token, payload) {
  return requestApi("/master-data/values", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify(payload)
    }
  });
}

export async function updateMasterValue(token, valueId, payload) {
  return requestApi(`/master-data/values/${valueId}`, {
    token,
    options: {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  });
}

export async function deleteMasterValue(token, valueId) {
  return requestApi(`/master-data/values/${valueId}`, {
    token,
    options: {
      method: "DELETE"
    }
  });
}

export async function getDocuments(token, filters = {}) {
  const query = new URLSearchParams();

  if (filters.departmentCode) {
    query.set("departmentCode", filters.departmentCode);
  }

  if (filters.status) {
    query.set("status", filters.status);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestApi(`/documents${suffix}`, { token });
}

export async function updateDocumentStatus(token, documentId, payload) {
  return requestApi(`/documents/${documentId}/status`, {
    token,
    options: {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  });
}

export async function getRetrievalHealth(token) {
  return requestApi("/retrieval/health", { token });
}

export async function runRetrievalReindex(token) {
  return requestApi("/retrieval/reindex", {
    token,
    options: {
      method: "POST"
    }
  });
}

export async function getRetrievalQuality(token) {
  return requestApi("/retrieval/quality", { token });
}

export async function getRetrievalRuns(token, limit = 20) {
  return requestApi(`/retrieval/runs?limit=${encodeURIComponent(limit)}`, { token });
}

export async function getRunFilterPresets(token) {
  return requestApi("/retrieval/run-presets", { token });
}

export async function createRunFilterPreset(token, payload) {
  return requestApi("/retrieval/run-presets", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify(payload)
    }
  });
}

export async function deleteRunFilterPreset(token, presetId) {
  return requestApi(`/retrieval/run-presets/${presetId}`, {
    token,
    options: {
      method: "DELETE"
    }
  });
}

export async function getRetrievalScheduler(token) {
  return requestApi("/retrieval/scheduler", { token });
}

export async function updateRetrievalScheduler(token, payload) {
  return requestApi("/retrieval/scheduler", {
    token,
    options: {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  });
}

export async function listDocumentChunks(token, documentId) {
  return requestApi(`/retrieval/documents/${documentId}/chunks`, { token });
}

export async function reindexDocumentChunks(token, documentId) {
  return requestApi(`/retrieval/documents/${documentId}/reindex`, {
    token,
    options: {
      method: "POST"
    }
  });
}

export async function getAgentConfigurations(token) {
  return requestApi("/agent-configs", { token });
}

export async function createAgentConfiguration(token, payload) {
  return requestApi("/agent-configs", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify(payload)
    }
  });
}

export async function updateAgentConfiguration(token, agentId, payload) {
  return requestApi(`/agent-configs/${agentId}`, {
    token,
    options: {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  });
}

export async function replaceAgentAssignments(token, agentId, payload) {
  return requestApi(`/agent-configs/${agentId}/assignments`, {
    token,
    options: {
      method: "PUT",
      body: JSON.stringify(payload)
    }
  });
}

export async function replaceAgentSteps(token, agentId, payload) {
  return requestApi(`/agent-configs/${agentId}/steps`, {
    token,
    options: {
      method: "PUT",
      body: JSON.stringify(payload)
    }
  });
}

export async function deleteAgentConfiguration(token, agentId) {
  return requestApi(`/agent-configs/${agentId}`, {
    token,
    options: {
      method: "DELETE"
    }
  });
}
