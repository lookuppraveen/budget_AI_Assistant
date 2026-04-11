import { Router }      from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize }    from "../../middleware/authorize.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  listScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  runScheduledReportNow
} from "./scheduler.service.js";

const schedulerRouter = Router();

// List all schedules (Admin + Analyst)
schedulerRouter.get(
  "/",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (_req, res) => {
    const schedules = await listScheduledReports();
    res.status(200).json({ schedules });
  })
);

// Create a new schedule (Admin only)
schedulerRouter.post(
  "/",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (req, res) => {
    const { name, reportType, frequency, recipients, filters } = req.body;
    if (!name || !reportType || !frequency || !Array.isArray(recipients) || !recipients.length) {
      return res.status(400).json({ message: "name, reportType, frequency, and at least one recipient are required" });
    }
    const schedule = await createScheduledReport(
      { name, reportType, frequency, recipients, filters },
      req.user.id
    );
    res.status(201).json({ schedule });
  })
);

// Update a schedule (Admin only)
schedulerRouter.patch(
  "/:id",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (req, res) => {
    const schedule = await updateScheduledReport(req.params.id, req.body);
    res.status(200).json({ schedule });
  })
);

// Delete a schedule (Admin only)
schedulerRouter.delete(
  "/:id",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (req, res) => {
    const result = await deleteScheduledReport(req.params.id);
    res.status(200).json(result);
  })
);

// Manually trigger a schedule now (Admin + Analyst)
schedulerRouter.post(
  "/:id/run",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const schedule = await runScheduledReportNow(req.params.id);
    res.status(200).json({ schedule });
  })
);

export { schedulerRouter };
