import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  createReport,
  exportExecutivePack,
  exportReportsExcel,
  getReportsSummary,
  listReports,
  runReport,
  scheduleReport
} from "./reports.service.js";

const createReportSchema = z.object({
  body: z.object({
    reportName: z.string().min(2).max(200),
    frequency: z.enum(["Daily", "Weekly", "Monthly", "Quarterly", "On-Demand"]),
    owner: z.string().min(2).max(120).optional()
  }),
  params: z.object({}),
  query: z.object({})
});

const scheduleReportSchema = z.object({
  body: z.object({
    scheduleCron: z.string().min(5).max(100)
  }),
  params: z.object({ id: z.string().uuid("Invalid report id") }),
  query: z.object({})
});

const reportIdParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({ id: z.string().uuid("Invalid report id") }),
  query: z.object({})
});

const reportsRouter = Router();

/**
 * @swagger
 * /reports:
 *   get:
 *     tags: [Reports]
 *     summary: List all reports
 *     responses:
 *       200: { description: Array of report records }
 */
reportsRouter.get(
  "/",
  authenticate,
  asyncHandler(async (_req, res) => {
    const reports = await listReports();
    res.status(200).json({ reports });
  })
);

/**
 * @swagger
 * /reports/summary:
 *   get:
 *     tags: [Reports]
 *     summary: Get SLA, status, and completeness summary
 *     responses:
 *       200: { description: Dashboard summary data }
 */
reportsRouter.get(
  "/summary",
  authenticate,
  asyncHandler(async (_req, res) => {
    const summary = await getReportsSummary();
    res.status(200).json({ summary });
  })
);

/**
 * @swagger
 * /reports/export:
 *   get:
 *     tags: [Reports]
 *     summary: Download Executive Pack (TXT or XLSX)
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [txt, xlsx] }
 *         description: "xlsx for Excel, omit for plain text"
 *     responses:
 *       200: { description: File download }
 *       422: { description: No Ready reports available }
 */
reportsRouter.get(
  "/export",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    if (req.query.format === "xlsx") {
      const buffer = await exportReportsExcel();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="executive-pack-${Date.now()}.xlsx"`);
      return res.status(200).send(buffer);
    }
    const text = await exportExecutivePack();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="executive-pack-${Date.now()}.txt"`);
    res.status(200).send(text);
  })
);

/**
 * @swagger
 * /reports:
 *   post:
 *     tags: [Reports]
 *     summary: Create a new report
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reportName, frequency]
 *             properties:
 *               reportName: { type: string }
 *               frequency: { type: string, enum: [Daily, Weekly, Monthly, Quarterly, On-Demand] }
 *               owner: { type: string }
 *     responses:
 *       201: { description: Created report }
 */
reportsRouter.post(
  "/",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  validate(createReportSchema),
  asyncHandler(async (req, res) => {
    const report = await createReport(req.validated.body, req.user.id);
    res.status(201).json({ report });
  })
);

/**
 * @swagger
 * /reports/{id}/run:
 *   post:
 *     tags: [Reports]
 *     summary: Run a report and generate output
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated report with output }
 *       404: { description: Report not found }
 */
reportsRouter.post(
  "/:id/run",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  validate(reportIdParamSchema),
  asyncHandler(async (req, res) => {
    const report = await runReport(req.validated.params.id, req.user.email);
    res.status(200).json({ report });
  })
);

/**
 * @swagger
 * /reports/{id}/schedule:
 *   post:
 *     tags: [Reports]
 *     summary: Schedule a report with a cron expression
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scheduleCron]
 *             properties:
 *               scheduleCron: { type: string, example: "0 6 * * 1" }
 *     responses:
 *       200: { description: Scheduled report }
 *       400: { description: Invalid cron expression }
 */
reportsRouter.post(
  "/:id/schedule",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  validate(scheduleReportSchema),
  asyncHandler(async (req, res) => {
    const report = await scheduleReport(req.validated.params.id, req.validated.body);
    res.status(200).json({ report });
  })
);

export { reportsRouter };
