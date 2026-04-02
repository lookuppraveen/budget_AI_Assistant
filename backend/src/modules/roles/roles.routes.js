import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  availablePermissions,
  createRole,
  deleteRole,
  listRolePermissions,
  listRoles,
  updateRole,
  updateRolePermissions
} from "./roles.service.js";
import {
  createRoleSchema,
  deleteRoleSchema,
  updateRolePermissionsSchema,
  updateRoleSchema
} from "./roles.schemas.js";

const rolesRouter = Router();

rolesRouter.get(
  "/",
  authenticate,
  asyncHandler(async (_req, res) => {
    const roles = await listRoles();
    res.status(200).json({ roles });
  })
);

rolesRouter.post(
  "/",
  authenticate,
  authorize("Admin"),
  validate(createRoleSchema),
  asyncHandler(async (req, res) => {
    const role = await createRole(req.validated.body.name);
    res.status(201).json({ role });
  })
);

rolesRouter.get(
  "/permissions",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (_req, res) => {
    const roles = await listRolePermissions();
    res.status(200).json({ roles, availablePermissions });
  })
);

rolesRouter.patch(
  "/:roleName/permissions",
  authenticate,
  authorize("Admin"),
  validate(updateRolePermissionsSchema),
  asyncHandler(async (req, res) => {
    const result = await updateRolePermissions(req.validated.params.roleName, req.validated.body.permissions);
    res.status(200).json(result);
  })
);

rolesRouter.patch(
  "/:roleName",
  authenticate,
  authorize("Admin"),
  validate(updateRoleSchema),
  asyncHandler(async (req, res) => {
    const role = await updateRole(req.validated.params.roleName, req.validated.body);
    res.status(200).json({ role });
  })
);

rolesRouter.delete(
  "/:roleName",
  authenticate,
  authorize("Admin"),
  validate(deleteRoleSchema),
  asyncHandler(async (req, res) => {
    const result = await deleteRole(req.validated.params.roleName);
    res.status(200).json({ result });
  })
);

export { rolesRouter };
