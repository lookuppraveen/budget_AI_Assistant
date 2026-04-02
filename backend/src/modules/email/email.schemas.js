import { z } from "zod";

export const testEmailSchema = z.object({
  body: z.object({
    provider: z.enum(["gmail", "m365", "smtp"]),
    config: z.record(z.string())
  }),
  params: z.object({}),
  query: z.object({})
});

export const getEmailConfigSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}),
  query: z.object({})
});
