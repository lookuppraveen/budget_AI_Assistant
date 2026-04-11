import { requestApi } from "./httpClient.js";

export async function getDashboardAnalytics(token) {
  return requestApi("/analytics/dashboard", { token });
}

export async function getBudgetForecast(token) {
  return requestApi("/analytics/budget-forecast", { token });
}

export async function getReportsSummary(token) {
  return requestApi("/reports/summary", { token });
}

export async function getReports(token) {
  return requestApi("/reports", { token });
}

export async function getAuditMetrics(token) {
  return requestApi("/audit/metrics", { token });
}

export async function getAuditLogs(token, { limit = 50, offset = 0, action, entityType } = {}) {
  const params = new URLSearchParams({ limit, offset });
  if (action) params.set("action", action);
  if (entityType) params.set("entityType", entityType);
  return requestApi(`/audit/logs?${params.toString()}`, { token });
}

export async function getAuditMetricDetail(token, type) {
  return requestApi(`/audit/metrics/detail?type=${encodeURIComponent(type)}`, { token });
}

export async function createReport(token, payload) {
  return requestApi("/reports", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) }
  });
}

export async function runReport(token, reportId) {
  return requestApi(`/reports/${reportId}/run`, {
    token,
    options: { method: "POST" }
  });
}

export async function scheduleReport(token, reportId, scheduleCron) {
  return requestApi(`/reports/${reportId}/schedule`, {
    token,
    options: { method: "POST", body: JSON.stringify({ scheduleCron }) }
  });
}

export async function downloadExecutivePack(token, format = "txt") {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";
  const url = `${API_BASE_URL}/reports/export${format === "xlsx" ? "?format=xlsx" : ""}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message || "Export failed");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = format === "xlsx" ? `executive-pack-${Date.now()}.xlsx` : `executive-pack-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(objectUrl);
}
