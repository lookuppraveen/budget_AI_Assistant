import { z } from "zod";

export const createMasterTypeSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Type name is required").max(80)
  }),
  params: z.object({}),
  query: z.object({})
});

export const updateMasterTypeSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Type name is required").max(80)
  }),
  params: z.object({
    id: z.coerce.number().int().positive("Invalid type id")
  }),
  query: z.object({})
});

export const deleteMasterTypeSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: z.coerce.number().int().positive("Invalid type id")
  }),
  query: z.object({})
});

export const createMasterValueSchema = z.object({
  body: z.object({
    typeName: z.string().min(2, "Type name is required").max(80),
    value: z.string().min(1, "Value is required").max(160)
  }),
  params: z.object({}),
  query: z.object({})
});

export const updateMasterValueSchema = z.object({
  body: z.object({
    value: z.string().min(1, "Value is required").max(160)
  }),
  params: z.object({
    id: z.string().uuid("Invalid value id")
  }),
  query: z.object({})
});

export const deleteMasterValueSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: z.string().uuid("Invalid value id")
  }),
  query: z.object({})
});
