import { requestApi } from "./httpClient.js";

export async function getSharePointConfig(token) {
  return requestApi("/sharepoint/config", { token });
}

export async function testSharePointConnection(token, config) {
  return requestApi("/sharepoint/test", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify(config)
    }
  });
}

export async function syncSharePoint(token) {
  return requestApi("/sharepoint/sync", {
    token,
    options: { method: "POST" }
  });
}
