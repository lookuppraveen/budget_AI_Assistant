import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize }    from "../../middleware/authorize.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { listScenarios, getScenario, createScenario, updateScenario, deleteScenario, compareScenarios } from "./scenarios.service.js";

const SCENARIO_ROLES = ["Admin", "Budget Analyst", "Cabinet"];
const scenariosRouter = Router();

// List scenarios
scenariosRouter.get(
  "/",
  authenticate,
  authorize(...SCENARIO_ROLES),
  asyncHandler(async (req, res) => {
    const scenarios = await listScenarios({ fiscalYear: req.query.fiscalYear });
    res.status(200).json({ scenarios });
  })
);

// Compare multiple scenarios by id list (comma-separated)
scenariosRouter.get(
  "/compare",
  authenticate,
  authorize(...SCENARIO_ROLES),
  asyncHandler(async (req, res) => {
    const ids = (req.query.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
    const scenarios = await compareScenarios(ids);
    res.status(200).json({ scenarios });
  })
);

// Get single scenario
scenariosRouter.get(
  "/:id",
  authenticate,
  authorize(...SCENARIO_ROLES),
  asyncHandler(async (req, res) => {
    const scenario = await getScenario(req.params.id);
    res.status(200).json({ scenario });
  })
);

// Create scenario
scenariosRouter.post(
  "/",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const scenario = await createScenario(req.body, req.user.id);
    res.status(201).json({ scenario });
  })
);

// Update scenario
scenariosRouter.patch(
  "/:id",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const scenario = await updateScenario(req.params.id, req.body, req.user.id);
    res.status(200).json({ scenario });
  })
);

// Delete scenario
scenariosRouter.delete(
  "/:id",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const result = await deleteScenario(req.params.id);
    res.status(200).json(result);
  })
);

export { scenariosRouter };
