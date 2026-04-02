import { z } from "zod";

const stepSchema = z.object({
  key: z.string().min(2).max(80),
  title: z.string().min(2).max(240),
  meaning: z.string().min(2).max(500),
  placeholder: z.string().max(500).optional(),
  value: z.string().max(12000).optional(),
  done: z.boolean().optional(),
  order: z.coerce.number().int().positive().optional()
});

const departmentSelectorFieldsSchema = z.object({
  departmentId: z.coerce.number().int().positive().optional(),
  departmentCode: z.string().min(2).max(10).optional(),
  departmentName: z.string().min(2).max(120).optional()
});

function departmentSelectorPresent(value) {
  return (
    value.departmentId !== undefined ||
    Boolean(value.departmentCode?.trim()) ||
    Boolean(value.departmentName?.trim())
  );
}

export const createAgentConfigurationSchema = z.object({
  body: departmentSelectorFieldsSchema
    .extend({
      name: z.string().min(2).max(120),
      appliesToAll: z.boolean().optional(),
      userIds: z.array(z.string().uuid()).max(200).optional(),
      scope: z.string().trim().min(2).max(12000).optional(),
      riskLanguage: z.string().trim().min(2).max(12000).optional(),
      steps: z.array(stepSchema).max(50).optional()
    })
    .refine(departmentSelectorPresent, {
      message: "Provide departmentId, departmentCode, or departmentName."
    }),
  params: z.object({}),
  query: z.object({})
});

export const listAgentConfigurationsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}),
  query: z.object({
    departmentCode: z.string().min(2).max(10).optional(),
    isActive: z
      .string()
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true"))
  })
});

export const updateAgentConfigurationSchema = z.object({
  body: z
    .object({
      name: z.string().min(2).max(120).optional(),
      departmentId: z.coerce.number().int().positive().optional(),
      departmentCode: z.string().min(2).max(10).optional(),
      departmentName: z.string().min(2).max(120).optional(),
      appliesToAll: z.boolean().optional(),
      isActive: z.boolean().optional(),
      scope: z.string().trim().min(2).max(12000).optional(),
      riskLanguage: z.string().trim().min(2).max(12000).optional()
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: "Provide at least one field to update."
    }),
  params: z.object({
    id: z.string().uuid("Invalid agent id")
  }),
  query: z.object({})
});

export const replaceAssignmentsSchema = z.object({
  body: z.object({
    appliesToAll: z.boolean(),
    userIds: z.array(z.string().uuid()).max(200).optional()
  }),
  params: z.object({
    id: z.string().uuid("Invalid agent id")
  }),
  query: z.object({})
});

export const replaceStepsSchema = z.object({
  body: z.object({
    steps: z.array(stepSchema).min(1).max(50)
  }),
  params: z.object({
    id: z.string().uuid("Invalid agent id")
  }),
  query: z.object({})
});

export const agentIdParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: z.string().uuid("Invalid agent id")
  }),
  query: z.object({})
});
