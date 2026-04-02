import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  createDepartmentSchema,
  deleteDepartmentSchema,
  updateDepartmentSchema
} from "./departments.schemas.js";
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment
} from "./departments.service.js";

const departmentsRouter = Router();

departmentsRouter.get(
  "/",
  authenticate,
  asyncHandler(async (_req, res) => {
    const departments = await listDepartments();
    res.status(200).json({ departments });
  })
);

departmentsRouter.post(
  "/",
  authenticate,
  authorize("Admin"),
  validate(createDepartmentSchema),
  asyncHandler(async (req, res) => {
    const department = await createDepartment(req.validated.body);
    res.status(201).json({ department });
  })
);

departmentsRouter.patch(
  "/:id",
  authenticate,
  authorize("Admin"),
  validate(updateDepartmentSchema),
  asyncHandler(async (req, res) => {
    const department = await updateDepartment(req.validated.params.id, req.validated.body);
    res.status(200).json({ department });
  })
);

departmentsRouter.delete(
  "/:id",
  authenticate,
  authorize("Admin"),
  validate(deleteDepartmentSchema),
  asyncHandler(async (req, res) => {
    const result = await deleteDepartment(req.validated.params.id);
    res.status(200).json({ result });
  })
);

export { departmentsRouter };
