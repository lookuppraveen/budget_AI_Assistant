import { z } from "zod";

export const updateUserSchema = z.object({
  body: z.object({
    role: z.string().min(2).max(80).optional(),
    isActive: z.boolean().optional(),
    departmentCode: z.string().min(2).max(10).optional()
  }),
  params: z.object({
    id: z.string().uuid("Invalid user id")
  }),
  query: z.object({})
});
