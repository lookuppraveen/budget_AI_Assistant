import { z } from "zod";

export const createRoleSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(80)
  }),
  params: z.object({}),
  query: z.object({})
});

export const updateRoleSchema = z.object({
  body: z
    .object({
      name: z.string().min(2).max(80).optional(),
      isActive: z.boolean().optional()
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: "Provide at least one field to update"
    }),
  params: z.object({
    roleName: z.string().min(2)
  }),
  query: z.object({})
});

export const deleteRoleSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    roleName: z.string().min(2)
  }),
  query: z.object({})
});

export const updateRolePermissionsSchema = z.object({
  body: z.object({
    permissions: z.array(z.string().min(1)).max(100)
  }),
  params: z.object({
    roleName: z.string().min(2)
  }),
  query: z.object({})
});
