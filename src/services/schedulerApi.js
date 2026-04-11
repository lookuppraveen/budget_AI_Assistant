import { requestApi } from "./httpClient.js";

export async function listScheduledReports(token) {
  return requestApi("/scheduler", { token });
}

export async function createScheduledReport(token, payload) {
  return requestApi("/scheduler", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) }
  });
}

export async function updateScheduledReport(token, id, payload) {
  return requestApi(`/scheduler/${id}`, {
    token,
    options: { method: "PATCH", body: JSON.stringify(payload) }
  });
}

export async function deleteScheduledReport(token, id) {
  return requestApi(`/scheduler/${id}`, {
    token,
    options: { method: "DELETE" }
  });
}

export async function runScheduledReportNow(token, id) {
  return requestApi(`/scheduler/${id}/run`, {
    token,
    options: { method: "POST" }
  });
}
