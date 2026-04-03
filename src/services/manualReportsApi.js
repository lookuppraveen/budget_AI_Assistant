import { requestApi } from "./httpClient.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";

export async function generateReport(token, payload) {
  return requestApi("/manual-reports/generate", {
    token,
    options: { method: "POST", body: JSON.stringify(payload) }
  });
}

export async function listManualReports(token) {
  return requestApi("/manual-reports", { token });
}

export async function getManualReport(token, reportId) {
  return requestApi(`/manual-reports/${reportId}`, { token });
}

export async function deleteManualReport(token, reportId) {
  return requestApi(`/manual-reports/${reportId}`, {
    token,
    options: { method: "DELETE" }
  });
}

// Download triggers a browser file save — uses fetch directly so we can
// handle the blob response rather than JSON.
export async function downloadManualReport(token, reportId, title, format) {
  const response = await fetch(
    `${API_BASE_URL}/manual-reports/${reportId}/download`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    throw new Error("Download failed. The report may not be ready yet.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ext = format === "docx" ? "docx" : format === "pdf" ? "pdf" : "txt";
  const safeName = (title || "report").replace(/[^a-z0-9_\-\s]/gi, "_").trim();
  a.href = url;
  a.download = `${safeName}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
