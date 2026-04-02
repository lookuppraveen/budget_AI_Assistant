import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  createRunFilterPreset,
  deleteRunFilterPreset,
  getRetrievalHealth,
  getRetrievalQualityMetrics,
  getSchedulerConfig,
  listRunFilterPresets,
  listRetrievalRuns,
  listDocumentChunks,
  runDocumentReindexWithHistory,
  runScheduledReindex,
  searchKnowledge,
  updateSchedulerConfig
} from "./retrieval.service.js";

const retrievalRouter = Router();

retrievalRouter.get(
  "/health",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (_req, res) => {
    const health = await getRetrievalHealth();
    res.status(200).json({ health });
  })
);

retrievalRouter.post(
  "/reindex",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (_req, res) => {
    const result = await runScheduledReindex("manual-full", "manual-full");
    res.status(200).json({ result });
  })
);

retrievalRouter.post(
  "/reindex/scheduler-run",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (_req, res) => {
    const result = await runScheduledReindex("manual-scheduler-run", "manual-scheduler-run");
    res.status(200).json({ result });
  })
);

retrievalRouter.get(
  "/scheduler",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (_req, res) => {
    const scheduler = await getSchedulerConfig();
    res.status(200).json({ scheduler });
  })
);

retrievalRouter.patch(
  "/scheduler",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (req, res) => {
    const enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : false;
    const intervalMinutesRaw = Number(req.body?.intervalMinutes || 60);
    const intervalMinutes = Math.max(5, Math.min(1440, Number.isFinite(intervalMinutesRaw) ? intervalMinutesRaw : 60));
    const scheduler = await updateSchedulerConfig({ enabled, intervalMinutes });
    res.status(200).json({ scheduler });
  })
);

retrievalRouter.get(
  "/run-presets",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const presets = await listRunFilterPresets(req.user.id);
    res.status(200).json({ presets });
  })
);

retrievalRouter.post(
  "/run-presets",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const preset = await createRunFilterPreset(req.user.id, req.user.role, req.body || {});
    res.status(201).json({ preset });
  })
);

retrievalRouter.delete(
  "/run-presets/:presetId",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const result = await deleteRunFilterPreset(req.params.presetId, req.user.id, req.user.role);
    res.status(200).json({ result });
  })
);

retrievalRouter.get(
  "/runs",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const limit = Number(req.query?.limit || 20);
    const runs = await listRetrievalRuns(limit);
    res.status(200).json({ runs });
  })
);

retrievalRouter.get(
  "/documents/:documentId/chunks",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const chunks = await listDocumentChunks(req.params.documentId);
    res.status(200).json({ chunks });
  })
);

retrievalRouter.post(
  "/documents/:documentId/reindex",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (req, res) => {
    const result = await runDocumentReindexWithHistory(req.params.documentId, "manual-document");
    const chunks = await listDocumentChunks(req.params.documentId);
    res.status(200).json({ result, chunksCount: chunks.length });
  })
);

retrievalRouter.get(
  "/quality",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (_req, res) => {
    const quality = await getRetrievalQualityMetrics();
    res.status(200).json({ quality });
  })
);

/**
 * @swagger
 * /retrieval/search:
 *   get:
 *     tags: [Retrieval]
 *     summary: Semantic search across the knowledge base
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Search query
 *       - in: query
 *         name: domain
 *         schema: { type: string }
 *       - in: query
 *         name: department
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 5 }
 *     responses:
 *       200:
 *         description: Array of matching knowledge chunks with score and excerpt
 *       400: { description: Missing query parameter }
 */
retrievalRouter.get(
  "/search",
  authenticate,
  asyncHandler(async (req, res) => {
    const q = (req.query.q || "").trim();
    if (!q) {
      return res.status(400).json({ message: "Query parameter 'q' is required." });
    }
    const { domain, department, limit } = req.query;
    const results = await searchKnowledge(q, { domain, department, limit });
    res.status(200).json({ results, query: q });
  })
);

export { retrievalRouter };
