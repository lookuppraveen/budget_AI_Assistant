import { z } from "zod";

const messageSource = ["text", "voice"];

export const listConversationsQuerySchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).optional()
  })
});

export const createConversationSchema = z.object({
  body: z.object({
    title: z.string().min(2).max(160).optional()
  }),
  params: z.object({}),
  query: z.object({})
});

export const conversationParamsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: z.string().uuid("Invalid conversation id")
  }),
  query: z.object({})
});

export const createChatMessageSchema = z.object({
  body: z.object({
    conversationId: z.string().uuid("Invalid conversation id").optional(),
    message: z.string().min(1, "Message is required").max(4000),
    source: z.enum(messageSource).default("text")
  }),
  params: z.object({}),
  query: z.object({})
});

export const createVoiceLogSchema = z.object({
  body: z.object({
    conversationId: z.string().uuid("Invalid conversation id").optional(),
    eventType: z.string().min(2).max(80),
    direction: z.enum(["user", "assistant", "system"]).default("system"),
    transcript: z.string().max(4000).optional(),
    status: z.string().max(120).optional(),
    durationMs: z.number().int().min(0).optional(),
    metadata: z.record(z.any()).optional()
  }),
  params: z.object({}),
  query: z.object({})
});
