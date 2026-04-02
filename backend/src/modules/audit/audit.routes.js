import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getAuditLogs, getAuditMetrics } from "./audit.service.js";

const auditRouter = Router();

/**
 * @swagger
 * /audit/metrics:
 *   get:
 *     tags: [Audit]
 *     summary: Get aggregate audit metrics
 *     responses:
 *       200: { description: Array of metric label/value pairs }
 */
auditRouter.get(
  "/metrics",
  authenticate,
  asyncHandler(async (_req, res) => {
    const metrics = await getAuditMetrics();
    res.status(200).json({ metrics });
  })
);

/**
 * @swagger
 * /audit/logs:
 *   get:
 *     tags: [Audit]
 *     summary: Paginated activity log
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: entityType
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated audit log entries with total count }
 */
auditRouter.get(
  "/logs",
  authenticate,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const offset = Number(req.query.offset || 0);
    const { action, entityType } = req.query;
    const result = await getAuditLogs({ limit, offset, action, entityType });
    res.status(200).json(result);
  })
);

export { auditRouter };
