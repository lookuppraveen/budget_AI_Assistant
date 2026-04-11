import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize }    from "../../middleware/authorize.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getDashboardAnalytics, getBudgetForecast, getProactiveAlerts, generateTalkingPoints, generateVarianceExplanation } from "./analytics.service.js";

const analyticsRouter = Router();

analyticsRouter.get(
  "/dashboard",
  authenticate,
  asyncHandler(async (_req, res) => {
    const dashboard = await getDashboardAnalytics();
    res.status(200).json({ dashboard });
  })
);

analyticsRouter.get(
  "/budget-forecast",
  authenticate,
  authorize("Admin", "Budget Analyst", "Cabinet"),
  asyncHandler(async (_req, res) => {
    const forecast = await getBudgetForecast();
    res.status(200).json({ forecast });
  })
);

// Proactive alerts — surfaced in dashboard + notification panel
analyticsRouter.get(
  "/proactive-alerts",
  authenticate,
  authorize("Admin", "Budget Analyst", "Cabinet"),
  asyncHandler(async (_req, res) => {
    const result = await getProactiveAlerts();
    res.status(200).json(result);
  })
);

// Executive copilot — talking points for a fiscal year
analyticsRouter.get(
  "/executive/talking-points",
  authenticate,
  authorize("Admin", "Budget Analyst", "Cabinet"),
  asyncHandler(async (req, res) => {
    const result = await generateTalkingPoints(req.query.fiscalYear);
    res.status(200).json(result);
  })
);

// Executive copilot — variance explanation for a fiscal year
analyticsRouter.get(
  "/executive/variance",
  authenticate,
  authorize("Admin", "Budget Analyst", "Cabinet"),
  asyncHandler(async (req, res) => {
    const result = await generateVarianceExplanation(req.query.fiscalYear);
    res.status(200).json(result);
  })
);

export { analyticsRouter };