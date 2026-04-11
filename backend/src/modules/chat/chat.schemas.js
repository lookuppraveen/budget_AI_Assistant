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

// Budget context fields that scope AI answers to a specific department/fund/year
export const updateConversationContextSchema = z.object({
  body: z.object({
    department: z.string().max(120).optional(),
    fundType: z.string().max(80).optional(),
    fiscalYear: z.string().max(20).optional(),
    topic: z.string().max(200).optional()
  }),
  params: z.object({
    id: z.string().uuid("Invalid conversation id")
  }),
  query: z.object({})
});

// Review queue item update (budget office resolves an escalation)
export const updateReviewQueueSchema = z.object({
  body: z.object({
    status: z.enum(["reviewed", "resolved", "dismissed"]),
    reviewerNotes: z.string().max(2000).optional()
  }),
  params: z.object({
    id: z.string().uuid("Invalid review queue item id")
  }),
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
