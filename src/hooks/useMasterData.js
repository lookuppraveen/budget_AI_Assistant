import { useEffect, useState } from "react";
import { getMasterDataLookup } from "../services/masterDataApi.js";

// Module-level cache: typeName → string[]
// Survives re-renders; resets on full page reload.
const _cache = new Map();

/**
 * useMasterData(token, typeName, fallback?)
 *
 * Returns { values, loading } where values is a string[].
 * Falls back to `fallback` array while loading or on error,
 * so dropdowns never appear empty.
 *
 * @param {string} token        - JWT auth token
 * @param {string} typeName     - Master data type name, e.g. "Fiscal Year"
 * @param {string[]} [fallback] - Static fallback shown while loading
 */
export function useMasterData(token, typeName, fallback = []) {
  const [values, setValues]   = useState(() => _cache.get(typeName) ?? fallback);
  const [loading, setLoading] = useState(!_cache.has(typeName));

  useEffect(() => {
    if (!token || !typeName) return;
    if (_cache.has(typeName)) {
      setValues(_cache.get(typeName));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getMasterDataLookup(token, typeName)
      .then((data) => {
        if (cancelled) return;
        const sorted = data.length ? data : fallback;
        _cache.set(typeName, sorted);
        setValues(sorted);
      })
      .catch(() => {
        if (!cancelled) setValues(fallback);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, typeName]);

  return { values, loading };
}
