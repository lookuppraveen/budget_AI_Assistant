import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { updateUserSchema } from "./admin-users.schemas.js";
import { listAdminUsers, updateAdminUser } from "./admin-users.service.js";
import { logAudit } from "../../utils/audit.js";

const adminUsersRouter = Router();

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users (Admin only)
 *     responses:
 *       200: { description: Array of user records }
 */
adminUsersRouter.get(
  "/",
  authenticate,
  authorize("Admin"),
  asyncHandler(async (_req, res) => {
    const users = await listAdminUsers();
    res.status(200).json({ users });
  })
);

/**
 * @swagger
 * /admin/users/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update a user's role, department, or active status
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role: { type: string }
 *               departmentCode: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Updated user record }
 */
adminUsersRouter.patch(
  "/:id",
  authenticate,
  authorize("Admin"),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const user = await updateAdminUser(req.validated.params.id, req.validated.body);
    logAudit(req, "user.updated", "user", req.validated.params.id, req.validated.body);
    res.status(200).json({ user });
  })
);

export { adminUsersRouter };