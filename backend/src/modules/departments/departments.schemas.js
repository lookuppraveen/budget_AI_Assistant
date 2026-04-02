import { z } from "zod";

export const createDepartmentSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Department name is required"),
    code: z.string().min(2, "Department code is required").max(10),
    owner: z.string().min(2).optional().or(z.literal(""))
  }),
  params: z.object({}),
  query: z.object({})
});

export const updateDepartmentSchema = z.object({
  body: z
    .object({
      name: z.string().min(2).optional(),
      code: z.string().min(2).max(10).optional(),
      owner: z.string().min(2).optional().or(z.literal(""))
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: "Provide at least one field to update"
    }),
  params: z.object({
    id: z.coerce.number().int().positive("Invalid department id")
  }),
  query: z.object({})
});

export const deleteDepartmentSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: z.coerce.number().int().positive("Invalid department id")
  }),
  query: z.object({})
});
