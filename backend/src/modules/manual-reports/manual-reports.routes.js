import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  generateManualReport,
  listManualReports,
  getManualReportContent,
  deleteManualReport,
  REPORT_TYPES
} from "./manual-reports.service.js";

const manualReportsRouter = Router();

// All routes require authentication
manualReportsRouter.use(authenticate);

const generateSchema = z.object({
  body: z.object({
    title: z.string().min(3).max(200),
    reportType: z.enum(REPORT_TYPES),
    domain: z.string().max(100).optional(),
    departmentId: z.number().int().positive().optional(),
    departmentName: z.string().max(100).optional(),
    fiscalYear: z.string().max(20).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    additionalNotes: z.string().max(1000).optional(),
    format: z.enum(["txt", "docx"]).default("txt")
  })
});

const idSchema = z.object({
  params: z.object({ id: z.string().uuid() })
});

// POST /api/v1/manual-reports/generate
manualReportsRouter.post(
  "/generate",
  validate(generateSchema),
  asyncHandler(async (req, res) => {
    const report = await generateManualReport(req.user.id, req.validated.body);
    res.status(201).json({ report });
  })
);

// GET /api/v1/manual-reports
manualReportsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const reports = await listManualReports(req.user.id, req.user.role);
    res.json({ reports });
  })
);

// GET /api/v1/manual-reports/:id/download
manualReportsRouter.get(
  "/:id/download",
  validate(idSchema),
  asyncHandler(async (req, res) => {
    const report = await getManualReportContent(
      req.validated.params.id,
      req.user.id,
      req.user.role
    );

    if (report.status !== "Ready" || !report.content) {
      return res.status(400).json({ message: "Report is not ready for download." });
    }

    const ext = report.format === "docx" ? "docx" : "txt";
    const safeName = report.title.replace(/[^a-z0-9_\-\s]/gi, "_").trim();
    const filename = `${safeName}.${ext}`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(report.content);
  })
);

// GET /api/v1/manual-reports/:id
manualReportsRouter.get(
  "/:id",
  validate(idSchema),
  asyncHandler(async (req, res) => {
    const report = await getManualReportContent(
      req.validated.params.id,
      req.user.id,
      req.user.role
    );
    res.json({ report });
  })
);

// DELETE /api/v1/manual-reports/:id
manualReportsRouter.delete(
  "/:id",
  validate(idSchema),
  asyncHandler(async (req, res) => {
    // Read Only role cannot delete
    if (req.user.role === "Read Only") {
      return res.status(403).json({ message: "Read Only users cannot delete reports." });
    }
    await deleteManualReport(req.validated.params.id, req.user.id, req.user.role);
    return res.json({ message: "Report deleted." });
  })
);

export { manualReportsRouter };
