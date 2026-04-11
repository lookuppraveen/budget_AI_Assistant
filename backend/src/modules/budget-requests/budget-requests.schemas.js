import { z } from "zod";

const FISCAL_YEARS = ["FY23", "FY24", "FY25", "FY26", "FY27", "FY28"];
const REQUEST_TYPES = ["operational", "capital", "staffing", "grant", "other"];
const COST_TYPES = ["one-time", "recurring", "mixed"];
const STATUSES = ["draft", "submitted", "under_review", "approved", "denied", "on_hold"];
const PRIORITIES = ["low", "normal", "high", "critical"];

export const createBudgetRequestSchema = z.object({
  body: z.object({
    title:              z.string().min(5).max(300),
    fiscalYear:         z.enum(FISCAL_YEARS),
    fundType:           z.string().max(80).optional(),
    expenseCategory:    z.string().max(80).optional(),
    requestType:        z.enum(REQUEST_TYPES).default("operational"),
    costType:           z.enum(COST_TYPES).default("recurring"),
    baseBudgetAmount:   z.coerce.number().min(0).default(0),
    requestedAmount:    z.coerce.number().min(1, "Requested amount must be greater than 0"),
    recurringAmount:    z.coerce.number().min(0).default(0),
    oneTimeAmount:      z.coerce.number().min(0).default(0),
    justification:      z.string().min(20, "Justification must be at least 20 characters").max(8000),
    strategicAlignment: z.string().max(2000).optional(),
    impactDescription:  z.string().max(2000).optional(),
    deadline:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional()
  }),
  params: z.object({}),
  query:  z.object({})
});

export const updateBudgetRequestSchema = z.object({
  body: z.object({
    title:              z.string().min(5).max(300).optional(),
    fiscalYear:         z.enum(FISCAL_YEARS).optional(),
    fundType:           z.string().max(80).optional(),
    expenseCategory:    z.string().max(80).optional(),
    requestType:        z.enum(REQUEST_TYPES).optional(),
    costType:           z.enum(COST_TYPES).optional(),
    baseBudgetAmount:   z.coerce.number().min(0).optional(),
    requestedAmount:    z.coerce.number().min(1).optional(),
    recurringAmount:    z.coerce.number().min(0).optional(),
    oneTimeAmount:      z.coerce.number().min(0).optional(),
    justification:      z.string().min(20).max(8000).optional(),
    strategicAlignment: z.string().max(2000).optional(),
    impactDescription:  z.string().max(2000).optional(),
    deadline:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  }),
  params: z.object({ id: z.string().uuid() }),
  query:  z.object({})
});

export const submitBudgetRequestSchema = z.object({
  body:   z.object({}),
  params: z.object({ id: z.string().uuid() }),
  query:  z.object({})
});

export const reviewBudgetRequestSchema = z.object({
  body: z.object({
    status:            z.enum(["approved", "denied", "on_hold", "under_review"]),
    reviewerNotes:     z.string().max(4000).optional(),
    decisionRationale: z.string().max(4000).optional(),
    priority:          z.enum(PRIORITIES).optional(),
    assignedTo:        z.string().uuid().optional()
  }),
  params: z.object({ id: z.string().uuid() }),
  query:  z.object({})
});

export const listBudgetRequestsSchema = z.object({
  body:   z.object({}).optional(),
  params: z.object({}),
  query:  z.object({
    status:        z.enum([...STATUSES, "all"]).optional(),
    fiscalYear:    z.string().optional(),
    departmentId:  z.coerce.number().int().positive().optional(),
    priority:      z.enum(PRIORITIES).optional(),
    limit:         z.coerce.number().int().min(1).max(100).optional(),
    offset:        z.coerce.number().int().min(0).optional()
  })
});

export const requestParamsSchema = z.object({
  body:   z.object({}).optional(),
  params: z.object({ id: z.string().uuid() }),
  query:  z.object({})
});

export const updateScoringCriteriaSchema = z.object({
  body: z.object({
    criteria: z.array(z.object({
      key:      z.string().min(1),
      weight:   z.coerce.number().min(0).max(1),
      isActive: z.boolean().optional()
    })).min(1)
  }),
  params: z.object({}),
  query:  z.object({})
});
