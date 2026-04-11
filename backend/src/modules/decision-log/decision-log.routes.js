import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize }    from "../../middleware/authorize.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  listDecisionLog, getDecisionEntry,
  createDecisionEntry, updateDecisionEntry, deleteDecisionEntry
} from "./decision-log.service.js";

const LOG_READ_ROLES  = ["Admin", "Budget Analyst", "Cabinet"];
const LOG_WRITE_ROLES = ["Admin", "Budget Analyst"];

const decisionLogRouter = Router();

// List entries (paginated, filterable by fiscalYear, entryType, referenceId)
decisionLogRouter.get(
  "/",
  authenticate,
  authorize(...LOG_READ_ROLES),
  asyncHandler(async (req, res) => {
    const { fiscalYear, entryType, referenceId, page, limit } = req.query;
    const result = await listDecisionLog({ fiscalYear, entryType, referenceId, page, limit });
    res.status(200).json(result);
  })
);

// Get single entry
decisionLogRouter.get(
  "/:id",
  authenticate,
  authorize(...LOG_READ_ROLES),
  asyncHandler(async (req, res) => {
    const entry = await getDecisionEntry(req.params.id);
    res.status(200).json({ entry });
  })
);

// Create entry
decisionLogRouter.post(
  "/",
  authenticate,
  authorize(...LOG_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const entry = await createDecisionEntry(req.body, req.user.id);
    res.status(201).json({ entry });
  })
);

// Update entry
decisionLogRouter.patch(
  "/:id",
  authenticate,
  authorize(...LOG_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const entry = await updateDecisionEntry(req.params.id, req.body, req.user.id);
    res.status(200).json({ entry });
  })
);

// Delete entry
decisionLogRouter.delete(
  "/:id",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (req, res) => {
    const result = await deleteDecisionEntry(req.params.id);
    res.status(200).json(result);
  })
);

export { decisionLogRouter };
