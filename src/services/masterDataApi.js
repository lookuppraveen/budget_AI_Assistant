import { requestApi } from "./httpClient.js";

/**
 * Fetch active values for a single master-data type.
 * Returns a plain string array, e.g. ["FY25", "FY26", "FY27"]
 */
export async function getMasterDataLookup(token, typeName) {
  const qs = `?type=${encodeURIComponent(typeName)}`;
  const data = await requestApi(`/master-data/lookup${qs}`, { token });
  return (data.values || []).map((v) => v.value);
}
