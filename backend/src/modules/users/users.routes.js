import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { listUsers } from "./users.service.js";

const usersRouter = Router();

usersRouter.get(
  "/",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (_req, res) => {
    const users = await listUsers();
    res.status(200).json({ users });
  })
);

export { usersRouter };