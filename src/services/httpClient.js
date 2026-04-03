const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://api.budgetagent.myaisquad.com/api/v1";
export const SESSION_EXPIRED_EVENT = "budget_ai:session-expired";

function emitSessionExpired(detail) {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail }));
}

export async function requestApi(path, { token, options = {}, notifyOnUnauthorized = true } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.message || "Request failed";
    const error = new Error(message);
    error.statusCode = response.status;
    error.code = payload?.code;

    if (notifyOnUnauthorized && response.status === 401) {
      emitSessionExpired({
        code: payload?.code || "UNAUTHORIZED",
        message
      });
    }

    throw error;
  }

  return payload;
}
