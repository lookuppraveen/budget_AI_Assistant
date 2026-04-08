import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { testEmailSchema, getEmailConfigSchema } from "./email.schemas.js";
import { getEmailConfig, testAndSaveEmailConfig, syncEmails } from "./email.service.js";
import { runEmailResponderCycle, getResponderStatus } from "./email-responder.service.js";
import { logAudit } from "../../utils/audit.js";

const emailRouter = Router();

/**
 * @swagger
 * /email/config:
 *   get:
 *     tags: [Email]
 *     summary: Get current email integration config (secrets masked)
 *     responses:
 *       200: { description: Email config or null }
 */
emailRouter.get(
  "/config",
  authenticate,
  authorize("Admin"),
  validate(getEmailConfigSchema),
  asyncHandler(async (_req, res) => {
    const config = await getEmailConfig();
    res.status(200).json({ config });
  })
);

/**
 * @swagger
 * /email/test:
 *   post:
 *     tags: [Email]
 *     summary: Test and save an email provider configuration
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, config]
 *             properties:
 *               provider: { type: string, enum: [gmail, m365, smtp] }
 *               config: { type: object }
 *     responses:
 *       200: { description: Connection test result }
 */
emailRouter.post(
  "/test",
  authenticate,
  authorize("Admin"),
  validate(testEmailSchema),
  asyncHandler(async (req, res) => {
    const { provider, config } = req.validated.body;
    const result = await testAndSaveEmailConfig(provider, config);
    res.status(200).json(result);
  })
);

/**
 * @swagger
 * /email/sync:
 *   post:
 *     tags: [Email]
 *     summary: Sync email attachments into the knowledge base
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               allowedTypes:
 *                 type: array
 *                 items: { type: string, enum: [PDF, DOCX, XLSX, PPTX, CSV, TXT] }
 *     responses:
 *       200: { description: Sync stats — emails scanned and attachments ingested }
 */
emailRouter.post(
  "/sync",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (req, res) => {
    const allowedTypes = Array.isArray(req.body?.allowedTypes) ? req.body.allowedTypes : [];
    const stats = await syncEmails(allowedTypes, req.user.departmentId || null, req.user.id || null);
    logAudit(req, "email.sync", "email_integration", null, { synced: stats.synced, attachments: stats.attachments, allowedTypes });
    res.status(200).json({ stats });
  })
);

/**
 * @swagger
 * /email/responder/status:
 *   get:
 *     tags: [Email]
 *     summary: Get email responder status and recent processed emails
 *     responses:
 *       200: { description: Responder counts and recent activity }
 */
emailRouter.get(
  "/responder/status",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (_req, res) => {
    const status = await getResponderStatus();
    res.status(200).json(status);
  })
);

/**
 * @swagger
 * /email/responder/run:
 *   post:
 *     tags: [Email]
 *     summary: Manually trigger one email responder poll cycle
 *     responses:
 *       200: { description: Cycle stats — processed, replied, skipped counts }
 */
emailRouter.post(
  "/responder/run",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (req, res) => {
    const stats = await runEmailResponderCycle();
    logAudit(req, "email.responder.run", "email_inbox_queries", null, stats);
    res.status(200).json({ stats });
  })
);

export { emailRouter };
