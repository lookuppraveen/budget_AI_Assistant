import { Router } from "express";

const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "budget-ai-assistant-api"
  });
});

export { healthRouter };