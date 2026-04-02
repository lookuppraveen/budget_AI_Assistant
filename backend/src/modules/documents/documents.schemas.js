import { z } from "zod";

const allowedSourceTypes = ["Upload", "SharePoint", "PublicLink", "EmailAttachment", "Transcript", "Other"];

export const createDocumentSchema = z.object({
  body: z.object({
    title: z.string().min(2, "Document title is required"),
    sourceType: z.enum(allowedSourceTypes),
    domain: z.string().min(2, "Domain is required"),
    departmentCode: z.string().min(2, "Department code is required").max(10),
    metadata: z.record(z.any()).optional(),
    rawText: z.string().max(500_000).optional()
  }),
  params: z.object({}),
  query: z.object({})
});

export const updateDocumentStatusSchema = z.object({
  body: z.object({
    status: z.enum(["Pending", "Approved", "Hold", "Rejected"]),
    reviewNote: z.string().max(1200).optional().or(z.literal(""))
  }),
  params: z.object({
    id: z.string().uuid("Invalid document id")
  }),
  query: z.object({})
});

export const uploadDocumentSchema = z.object({
  body: z.object({
    domain: z.string().min(2, "Domain is required"),
    departmentCode: z.string().min(2, "Department code is required").max(10)
  }),
  params: z.object({}),
  query: z.object({})
});

export const ingestUrlSchema = z.object({
  body: z.object({
    url: z.string().url("A valid URL is required"),
    domain: z.string().min(2, "Domain is required"),
    departmentCode: z.string().min(2, "Department code is required").max(10),
    title: z.string().max(300).optional()
  }),
  params: z.object({}),
  query: z.object({})
});

export const listDocumentsQuerySchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}),
  query: z.object({
    departmentCode: z.string().max(10).optional(),
    status: z.enum(["Pending", "Approved", "Hold", "Rejected"]).optional()
  })
});