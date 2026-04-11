import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  createMasterTypeSchema,
  createMasterValueSchema,
  deleteMasterTypeSchema,
  deleteMasterValueSchema,
  updateMasterTypeSchema,
  updateMasterValueSchema
} from "./master-data.schemas.js";
import {
  createMasterType,
  createMasterValue,
  deleteMasterType,
  deleteMasterValue,
  listMasterData,
  lookupMasterData,
  updateMasterType,
  updateMasterValue
} from "./master-data.service.js";

const masterDataRouter = Router();

// ── Public lookup — any authenticated user, single type by name ──────────────
masterDataRouter.get(
  "/lookup",
  authenticate,
  asyncHandler(async (req, res) => {
    const { type } = req.query;
    if (!type || typeof type !== "string" || type.trim().length === 0) {
      return res.status(400).json({ message: "Query param 'type' is required" });
    }
    const values = await lookupMasterData(type.trim());
    res.status(200).json({ values });
  })
);

// ── Admin: list all types + values ───────────────────────────────────────────
masterDataRouter.get(
  "/",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (_req, res) => {
    const types = await listMasterData();
    res.status(200).json({ types });
  })
);

masterDataRouter.post(
  "/types",
  authenticate,
  authorize("Admin"),
  validate(createMasterTypeSchema),
  asyncHandler(async (req, res) => {
    const type = await createMasterType(req.validated.body.name);
    res.status(201).json({ type });
  })
);

masterDataRouter.patch(
  "/types/:id",
  authenticate,
  authorize("Admin"),
  validate(updateMasterTypeSchema),
  asyncHandler(async (req, res) => {
    const type = await updateMasterType(req.validated.params.id, req.validated.body.name);
    res.status(200).json({ type });
  })
);

masterDataRouter.delete(
  "/types/:id",
  authenticate,
  authorize("Admin"),
  validate(deleteMasterTypeSchema),
  asyncHandler(async (req, res) => {
    const result = await deleteMasterType(req.validated.params.id);
    res.status(200).json({ result });
  })
);

masterDataRouter.post(
  "/values",
  authenticate,
  authorize("Admin"),
  validate(createMasterValueSchema),
  asyncHandler(async (req, res) => {
    const value = await createMasterValue(req.validated.body.typeName, req.validated.body.value);
    res.status(201).json({ value });
  })
);

masterDataRouter.delete(
  "/values/:id",
  authenticate,
  authorize("Admin"),
  validate(deleteMasterValueSchema),
  asyncHandler(async (req, res) => {
    const result = await deleteMasterValue(req.validated.params.id);
    res.status(200).json({ result });
  })
);

masterDataRouter.patch(
  "/values/:id",
  authenticate,
  authorize("Admin"),
  validate(updateMasterValueSchema),
  asyncHandler(async (req, res) => {
    const value = await updateMasterValue(req.validated.params.id, req.validated.body.value);
    res.status(200).json({ value });
  })
);

export { masterDataRouter };
