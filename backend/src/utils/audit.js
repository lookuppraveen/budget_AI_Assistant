/**
 * Lightweight audit logger.
 * Writes one row to audit_logs — always non-fatal (errors are swallowed).
 *
 * @param {import('express').Request} req  - Express request (for user + IP)
 * @param {string} action                  - Snake-cased verb, e.g. 'document.approved'
 * @param {string|null} entityType         - e.g. 'document', 'user', 'report'
 * @param {string|null} entityId           - UUID or other identifier
 * @param {object} details                 - Extra context stored as JSONB
 */
import { pool } from "../config/db.js";

export async function logAudit(req, action, entityType = null, entityId = null, details = {}) {
  const user = req?.user;
  const ip =
    req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req?.ip ||
    null;

  pool
    .query(
      `INSERT INTO audit_logs (user_id, user_email, user_role, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        user?.id || null,
        user?.email || null,
        user?.role || null,
        action,
        entityType,
        entityId ? String(entityId) : null,
        JSON.stringify(details),
        ip
      ]
    )
    .catch((err) => {
      console.error("[audit] log failed:", err.message);
    });
}
