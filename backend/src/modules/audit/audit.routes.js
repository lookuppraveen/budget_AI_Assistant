import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getAuditLogs, getAuditMetrics, getMetricDetail } from "./audit.service.js";

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

/**
 * @swagger
 * /audit/metrics/detail:
 *   get:
 *     tags: [Audit]
 *     summary: Drill-down data for a specific metric box
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [top-domain, risky-answers, top-source, coverage-gaps, avg-confidence, resolution-rate]
 *     responses:
 *       200: { description: Drill-down title, description, columns and rows }
 */
auditRouter.get(
  "/metrics/detail",
  authenticate,
  asyncHandler(async (req, res) => {
    const { type } = req.query;
    const detail = await getMetricDetail(type);
    res.status(200).json({ detail });
  })
);

export { auditRouter };
