import { requestApi } from "./httpClient.js";

export async function getEmailConfig(token) {
  return requestApi("/email/config", { token });
}

export async function testEmailConnection(token, provider, config) {
  return requestApi("/email/test", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify({ provider, config })
    }
  });
}

export async function syncEmail(token, allowedTypes = []) {
  return requestApi("/email/sync", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify({ allowedTypes })
    }
  });
}
