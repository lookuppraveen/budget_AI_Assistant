import { requestApi } from "./httpClient.js";

// ── Budget Requests ───────────────────────────────────────────────────────────

export async function listBudgetRequests(token, { status, fiscalYear, departmentId, priority, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (status)       params.set("status",       status);
  if (fiscalYear)   params.set("fiscalYear",   fiscalYear);
  if (departmentId) params.set("departmentId", departmentId);
  if (priority)     params.set("priority",     priority);
  if (limit)        params.set("limit",        String(limit));
  if (offset)       params.set("offset",       String(offset));
  const qs = params.toString();
  return requestApi(`/budget-requests${qs ? `?${qs}` : ""}`, { token });
}

export async function getBudgetRequest(token, id) {
  return requestApi(`/budget-requests/${id}`, { token });
}

export async function createBudgetRequest(token, payload) {
  return requestApi("/budget-requests", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) }
  });
}

export async function updateBudgetRequest(token, id, payload) {
  return requestApi(`/budget-requests/${id}`, {
    token,
    options: { method: "PATCH", body: JSON.stringify(payload) }
  });
}

export async function submitBudgetRequest(token, id) {
  return requestApi(`/budget-requests/${id}/submit`, {
    token,
    options: { method: "POST", body: JSON.stringify({}) }
  });
}

export async function reviewBudgetRequest(token, id, payload) {
  return requestApi(`/budget-requests/${id}/review`, {
    token,
    options: { method: "PATCH", body: JSON.stringify(payload) }
  });
}

export async function analyzeRequest(token, id) {
  return requestApi(`/budget-requests/${id}/analyze`, {
    token,
    options: { method: "POST", body: JSON.stringify({}) }
  });
}

export async function deleteBudgetRequest(token, id) {
  return requestApi(`/budget-requests/${id}`, {
    token,
    options: { method: "DELETE" }
  });
}

// ── Scoring Criteria ──────────────────────────────────────────────────────────

export async function getScoringCriteria(token) {
  return requestApi("/budget-requests/config/scoring-criteria", { token });
}

export async function updateScoringCriteria(token, criteria) {
  return requestApi("/budget-requests/config/scoring-criteria", {
    token,
    options: { method: "PATCH", body: JSON.stringify({ criteria }) }
  });
}

// ── Summaries ─────────────────────────────────────────────────────────────────

export async function generateRequestsSummary(token, { fiscalYear, departmentId, audienceLevel } = {}) {
  const params = new URLSearchParams();
  if (fiscalYear)    params.set("fiscalYear",    fiscalYear);
  if (departmentId)  params.set("departmentId",  departmentId);
  if (audienceLevel) params.set("audienceLevel", audienceLevel);
  return requestApi(`/budget-requests/summaries/generate?${params.toString()}`, { token });
}

// ── Excel Export ─────────────────────────────────────────────────────────────

export async function exportBudgetRequestsXlsx(token, { fiscalYear, status, departmentId } = {}) {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";
  const params = new URLSearchParams();
  if (fiscalYear)   params.set("fiscalYear",   fiscalYear);
  if (status)       params.set("status",       status);
  if (departmentId) params.set("departmentId", departmentId);
  const url = `${API_BASE_URL}/budget-requests/export?${params.toString()}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message || "Export failed");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `budget-requests-${fiscalYear || "all"}-${Date.now()}.xlsx`;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

// ── Anomalies ─────────────────────────────────────────────────────────────────

export async function getAnomalyDashboard(token, { fiscalYear } = {}) {
  const params = new URLSearchParams();
  if (fiscalYear) params.set("fiscalYear", fiscalYear);
  return requestApi(`/budget-requests/anomalies/dashboard?${params.toString()}`, { token });
}

export async function resolveAnomalyFlag(token, flagId) {
  return requestApi(`/budget-requests/anomalies/${flagId}/resolve`, {
    token,
    options: { method: "PATCH", body: JSON.stringify({}) }
  });
}
