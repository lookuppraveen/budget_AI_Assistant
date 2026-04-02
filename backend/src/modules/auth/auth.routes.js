import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from "./auth.schemas.js";
import { createPasswordResetRequest, getCurrentUser, loginUser, resetPassword, signupUser } from "./auth.service.js";
import { logAudit } from "../../utils/audit.js";

const authRouter = Router();

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role, departmentCode]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [Admin, "Budget Analyst", "Department Editor", "Read Only"] }
 *               departmentCode: { type: string }
 *     responses:
 *       201:
 *         description: User created, returns token
 *       400: { description: Validation error }
 *       409: { description: Email already exists }
 */
authRouter.post(
  "/signup",
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    const result = await signupUser(req.validated.body);
    res.status(201).json(result);
  })
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and receive a JWT
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful, returns user + token
 *       401: { description: Invalid credentials }
 */
authRouter.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await loginUser(req.validated.body);
    req.user = { id: result.user.id, email: result.user.email, role: result.user.role };
    logAudit(req, "user.login", "user", result.user.id, { email: result.user.email });
    res.status(200).json(result);
  })
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       202: { description: Reset email sent (always returns 202 to prevent enumeration) }
 */
authRouter.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await createPasswordResetRequest(req.validated.body.email);
    res.status(202).json({ message: "If the email exists, reset instructions have been sent." });
  })
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using a token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Password reset successful }
 *       400: { description: Invalid or expired token }
 */
authRouter.post(
  "/reset-password",
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await resetPassword(req.validated.body.token, req.validated.body.password);
    res.status(200).json({ message: "Password has been reset successfully." });
  })
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current authenticated user
 *     responses:
 *       200: { description: Current user object }
 *       401: { description: Unauthorized }
 */
authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req.user.id);
    res.status(200).json({ user });
  })
);

export { authRouter };