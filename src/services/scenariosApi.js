import { requestApi } from "./httpClient.js";

export async function listScenarios(token, { fiscalYear } = {}) {
  const qs = fiscalYear ? `?fiscalYear=${encodeURIComponent(fiscalYear)}` : "";
  return requestApi(`/scenarios${qs}`, { token });
}

export async function getScenario(token, id) {
  return requestApi(`/scenarios/${id}`, { token });
}

export async function compareScenarios(token, ids = []) {
  const qs = `?ids=${ids.map(encodeURIComponent).join(",")}`;
  return requestApi(`/scenarios/compare${qs}`, { token });
}

export async function createScenario(token, payload) {
  return requestApi("/scenarios", { token, options: { method: "POST", body: JSON.stringify(payload) } });
}

export async function updateScenario(token, id, payload) {
  return requestApi(`/scenarios/${id}`, { token, options: { method: "PATCH", body: JSON.stringify(payload) } });
}

export async function deleteScenario(token, id) {
  return requestApi(`/scenarios/${id}`, { token, options: { method: "DELETE" } });
}

// ── Executive Copilot ─────────────────────────────────────────────────────────

export async function getTalkingPoints(token, fiscalYear) {
  const qs = fiscalYear ? `?fiscalYear=${encodeURIComponent(fiscalYear)}` : "";
  return requestApi(`/analytics/executive/talking-points${qs}`, { token });
}

export async function getVarianceExplanation(token, fiscalYear) {
  const qs = fiscalYear ? `?fiscalYear=${encodeURIComponent(fiscalYear)}` : "";
  return requestApi(`/analytics/executive/variance${qs}`, { token });
}

export async function getProactiveAlerts(token) {
  return requestApi("/analytics/proactive-alerts", { token });
}

// ── Decision Log ──────────────────────────────────────────────────────────────

export async function listDecisionLog(token, { fiscalYear, entryType, referenceId, page, limit } = {}) {
  const params = new URLSearchParams();
  if (fiscalYear)  params.set("fiscalYear",  fiscalYear);
  if (entryType)   params.set("entryType",   entryType);
  if (referenceId) params.set("referenceId", referenceId);
  if (page)        params.set("page",        String(page));
  if (limit)       params.set("limit",       String(limit));
  const qs = params.toString();
  return requestApi(`/decision-log${qs ? `?${qs}` : ""}`, { token });
}

export async function createDecisionEntry(token, payload) {
  return requestApi("/decision-log", { token, options: { method: "POST", body: JSON.stringify(payload) } });
}

export async function updateDecisionEntry(token, id, payload) {
  return requestApi(`/decision-log/${id}`, { token, options: { method: "PATCH", body: JSON.stringify(payload) } });
}

export async function deleteDecisionEntry(token, id) {
  return requestApi(`/decision-log/${id}`, { token, options: { method: "DELETE" } });
}

// ── Chat feedback ─────────────────────────────────────────────────────────────

export async function submitFeedback(token, messageId, { rating, correction, feedbackType } = {}) {
  return requestApi(`/chat/messages/${messageId}/feedback`, {
    token,
    method: "POST",
    body: { rating, correction, feedbackType }
  });
}

export async function getMessageExplanation(token, messageId) {
  return requestApi(`/chat/messages/${messageId}/explain`, { token });
}
