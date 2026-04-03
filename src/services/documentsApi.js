import { requestApi, SESSION_EXPIRED_EVENT } from "./httpClient.js";

export async function getDocuments(token, { departmentCode, status } = {}) {
  const params = new URLSearchParams();
  if (departmentCode) params.set("departmentCode", departmentCode);
  if (status) params.set("status", status);
  const qs = params.toString();
  return requestApi(`/documents${qs ? `?${qs}` : ""}`, { token });
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";

export async function uploadDocumentFiles({ token, files, domain, departmentCode }) {
  const formData = new FormData();
  formData.append("domain", domain);
  formData.append("departmentCode", departmentCode);

  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
      // Do NOT set Content-Type — browser sets it with the multipart boundary automatically
    },
    body: formData
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.message || "Upload failed";
    const error = new Error(message);
    error.statusCode = response.status;

    if (response.status === 401) {
      window.dispatchEvent(
        new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { code: "UNAUTHORIZED", message } })
      );
    }

    throw error;
  }

  return payload;
}

export async function ingestDocumentUrl({ token, url, domain, departmentCode, title }) {
  return requestApi("/documents/ingest-url", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify({ url, domain, departmentCode, title })
    }
  });
}

export async function reuploadDocument({ token, documentId, file }) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/documents/${documentId}/reupload`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.message || "Re-upload failed";
    const error = new Error(message);
    error.statusCode = response.status;

    if (response.status === 401) {
      window.dispatchEvent(
        new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { code: "UNAUTHORIZED", message } })
      );
    }

    throw error;
  }

  return payload;
}

export async function deleteDocument(token, documentId) {
  return requestApi(`/documents/${documentId}`, {
    token,
    options: { method: "DELETE" }
  });
}

export async function downloadDocument(token, documentId) {
  return requestApi(`/documents/${documentId}/download`, { token });
}

export async function searchKnowledge(token, query, { domain, department, limit } = {}) {
  const params = new URLSearchParams({ q: query });
  if (domain) params.set("domain", domain);
  if (department) params.set("department", department);
  if (limit) params.set("limit", limit);
  return requestApi(`/retrieval/search?${params.toString()}`, { token });
}
