import { z } from "zod";

export const testSharePointSchema = z.object({
  body: z.object({
    tenantId: z.string().min(1, "Tenant ID is required"),
    clientId: z.string().min(1, "Client ID is required"),
    clientSecret: z.string().min(1, "Client Secret is required"),
    siteUrl: z.string().url("Valid SharePoint site URL is required"),
    libraryPath: z.string().min(1, "Library / folder path is required"),
    domain: z.string().min(1, "Domain is required")
  }),
  params: z.object({}),
  query: z.object({})
});

export const getSharePointConfigSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}),
  query: z.object({})
});
