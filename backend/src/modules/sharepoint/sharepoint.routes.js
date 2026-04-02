import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { testSharePointSchema, getSharePointConfigSchema } from "./sharepoint.schemas.js";
import { getSharePointConfig, testAndSaveSharePointConfig, syncSharePoint } from "./sharepoint.service.js";
import { logAudit } from "../../utils/audit.js";

const sharepointRouter = Router();

/**
 * @swagger
 * /sharepoint/config:
 *   get:
 *     tags: [SharePoint]
 *     summary: Get current SharePoint integration config
 *     responses:
 *       200: { description: SharePoint config or null }
 */
sharepointRouter.get(
  "/config",
  authenticate,
  authorize("Admin"),
  validate(getSharePointConfigSchema),
  asyncHandler(async (_req, res) => {
    const config = await getSharePointConfig();
    res.status(200).json({ config });
  })
);

/**
 * @swagger
 * /sharepoint/test:
 *   post:
 *     tags: [SharePoint]
 *     summary: Test and save SharePoint connection
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId, clientId, clientSecret, siteUrl, libraryPath]
 *             properties:
 *               tenantId: { type: string }
 *               clientId: { type: string }
 *               clientSecret: { type: string }
 *               siteUrl: { type: string }
 *               libraryPath: { type: string }
 *               domain: { type: string }
 *     responses:
 *       200: { description: Connection test result }
 */
sharepointRouter.post(
  "/test",
  authenticate,
  authorize("Admin"),
  validate(testSharePointSchema),
  asyncHandler(async (req, res) => {
    const result = await testAndSaveSharePointConfig(req.validated.body);
    res.status(200).json(result);
  })
);

/**
 * @swagger
 * /sharepoint/sync:
 *   post:
 *     tags: [SharePoint]
 *     summary: Sync files from SharePoint into the knowledge base
 *     responses:
 *       200: { description: Sync result with totalFiles and newDocuments }
 */
sharepointRouter.post(
  "/sync",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (req, res) => {
    const result = await syncSharePoint();
    logAudit(req, "sharepoint.sync", "sharepoint_integration", null, { totalFiles: result.totalFiles, newDocuments: result.newDocuments });
    res.status(200).json(result);
  })
);

export { sharepointRouter };
