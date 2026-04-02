import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getDashboardAnalytics } from "./analytics.service.js";

const analyticsRouter = Router();

analyticsRouter.get(
  "/dashboard",
  authenticate,
  asyncHandler(async (_req, res) => {
    const dashboard = await getDashboardAnalytics();
    res.status(200).json({ dashboard });
  })
);

export { analyticsRouter };