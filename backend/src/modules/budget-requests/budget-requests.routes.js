import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { validate } from "../../middleware/validate.js";
import {
  createBudgetRequestSchema,
  updateBudgetRequestSchema,
  submitBudgetRequestSchema,
  reviewBudgetRequestSchema,
  listBudgetRequestsSchema,
  requestParamsSchema,
  updateScoringCriteriaSchema
} from "./budget-requests.schemas.js";
import {
  listBudgetRequests,
  getBudgetRequest,
  createBudgetRequest,
  updateBudgetRequest,
  submitBudgetRequest,
  reviewBudgetRequest,
  deleteBudgetRequest,
  analyzeRequest,
  runRulesEngine,
  getScoringCriteria,
  updateScoringCriteria,
  generateRequestsSummary,
  getAnomalyDashboard,
  resolveAnomalyFlag,
  exportBudgetRequestsXlsx
} from "./budget-requests.service.js";

const REVIEWER_ROLES  = ["Admin", "Budget Analyst"];
const SUBMITTER_ROLES = ["Admin", "Budget Analyst", "Department Editor"];
const ALL_READ_ROLES  = ["Admin", "Budget Analyst", "Department Editor", "Cabinet"];

const budgetRequestsRouter = Router();

// ── List & search requests ────────────────────────────────────────────────────
budgetRequestsRouter.get(
  "/",
  authenticate,
  authorize(...ALL_READ_ROLES),
  validate(listBudgetRequestsSchema),
  asyncHandler(async (req, res) => {
    const result = await listBudgetRequests(req.validated.query, req.user);
    res.status(200).json(result);
  })
);

// ── Create a new request (Department Editor / Analyst / Admin) ────────────────
budgetRequestsRouter.post(
  "/",
  authenticate,
  authorize(...SUBMITTER_ROLES),
  validate(createBudgetRequestSchema),
  asyncHandler(async (req, res) => {
    const request = await createBudgetRequest(req.validated.body, req.user);
    res.status(201).json({ request });
  })
);

// ── Scoring criteria management (Admin only) ─────────────────────────────────
budgetRequestsRouter.get(
  "/config/scoring-criteria",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (_req, res) => {
    const criteria = await getScoringCriteria();
    res.status(200).json({ criteria });
  })
);

budgetRequestsRouter.patch(
  "/config/scoring-criteria",
  authenticate,
  authorize("Admin"),
  validate(updateScoringCriteriaSchema),
  asyncHandler(async (req, res) => {
    const criteria = await updateScoringCriteria(req.validated.body.criteria);
    res.status(200).json({ criteria });
  })
);

// ── Summary generation (dean / cabinet / board level) ────────────────────────
budgetRequestsRouter.get(
  "/summaries/generate",
  authenticate,
  authorize("Admin", "Budget Analyst", "Cabinet"),
  asyncHandler(async (req, res) => {
    const { fiscalYear, departmentId, audienceLevel } = req.query;
    const result = await generateRequestsSummary({ fiscalYear, departmentId, audienceLevel });
    res.status(200).json(result);
  })
);

// ── Excel export ─────────────────────────────────────────────────────────────
budgetRequestsRouter.get(
  "/export",
  authenticate,
  authorize(...ALL_READ_ROLES),
  asyncHandler(async (req, res) => {
    const { fiscalYear, status, departmentId } = req.query;
    const buffer = await exportBudgetRequestsXlsx({ fiscalYear, status, departmentId });
    const label  = fiscalYear ? fiscalYear : "all";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="budget-requests-${label}-${Date.now()}.xlsx"`);
    res.send(buffer);
  })
);

// ── Anomaly dashboard ─────────────────────────────────────────────────────────
budgetRequestsRouter.get(
  "/anomalies/dashboard",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const result = await getAnomalyDashboard({ fiscalYear: req.query.fiscalYear });
    res.status(200).json(result);
  })
);

// ── Resolve an anomaly flag ───────────────────────────────────────────────────
budgetRequestsRouter.patch(
  "/anomalies/:id/resolve",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const result = await resolveAnomalyFlag(req.params.id, req.user.id);
    res.status(200).json(result);
  })
);

// ── Get single request with scores, validations, anomalies ───────────────────
budgetRequestsRouter.get(
  "/:id",
  authenticate,
  authorize(...ALL_READ_ROLES),
  validate(requestParamsSchema),
  asyncHandler(async (req, res) => {
    const request = await getBudgetRequest(req.validated.params.id, req.user);
    res.status(200).json({ request });
  })
);

// ── Update (draft/on-hold only for submitter; analyst/admin anytime) ──────────
budgetRequestsRouter.patch(
  "/:id",
  authenticate,
  authorize(...SUBMITTER_ROLES),
  validate(updateBudgetRequestSchema),
  asyncHandler(async (req, res) => {
    const request = await updateBudgetRequest(req.validated.params.id, req.validated.body, req.user);
    res.status(200).json({ request });
  })
);

// ── Submit (moves from draft → submitted, triggers analysis) ─────────────────
budgetRequestsRouter.post(
  "/:id/submit",
  authenticate,
  authorize(...SUBMITTER_ROLES),
  validate(submitBudgetRequestSchema),
  asyncHandler(async (req, res) => {
    const request = await submitBudgetRequest(req.validated.params.id, req.user);
    res.status(200).json({ request });
  })
);

// ── Review (approve / deny / on_hold / under_review) — Analyst + Admin ───────
budgetRequestsRouter.patch(
  "/:id/review",
  authenticate,
  authorize(...REVIEWER_ROLES),
  validate(reviewBudgetRequestSchema),
  asyncHandler(async (req, res) => {
    const request = await reviewBudgetRequest(req.validated.params.id, req.validated.body, req.user.id);
    res.status(200).json({ request });
  })
);

// ── Manually trigger AI analysis ─────────────────────────────────────────────
budgetRequestsRouter.post(
  "/:id/analyze",
  authenticate,
  authorize(...REVIEWER_ROLES),
  validate(requestParamsSchema),
  asyncHandler(async (req, res) => {
    await analyzeRequest(req.validated.params.id);
    const request = await getBudgetRequest(req.validated.params.id, req.user);
    res.status(200).json({ request });
  })
);

// ── Re-run rules engine only ──────────────────────────────────────────────────
budgetRequestsRouter.post(
  "/:id/validate",
  authenticate,
  authorize(...REVIEWER_ROLES),
  validate(requestParamsSchema),
  asyncHandler(async (req, res) => {
    await runRulesEngine(req.validated.params.id);
    const request = await getBudgetRequest(req.validated.params.id, req.user);
    res.status(200).json({ request });
  })
);

// ── Delete (draft/denied only, or Admin) ─────────────────────────────────────
budgetRequestsRouter.delete(
  "/:id",
  authenticate,
  authorize(...SUBMITTER_ROLES),
  validate(requestParamsSchema),
  asyncHandler(async (req, res) => {
    const result = await deleteBudgetRequest(req.validated.params.id, req.user);
    res.status(200).json(result);
  })
);

export { budgetRequestsRouter };
