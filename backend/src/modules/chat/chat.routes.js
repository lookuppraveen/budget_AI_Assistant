import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { validate } from "../../middleware/validate.js";
import {
  conversationParamsSchema,
  createChatMessageSchema,
  createConversationSchema,
  createVoiceLogSchema,
  listConversationsQuerySchema,
  updateConversationContextSchema,
  updateReviewQueueSchema
} from "./chat.schemas.js";
import { authorize } from "../../middleware/authorize.js";
import {
  createChatTurn,
  createConversation,
  createVoiceLog,
  deleteConversation,
  getConversationMessages,
  getConversationContext,
  listConversations,
  listReviewQueue,
  saveFeedback,
  getMessageExplanation,
  streamChatTurn,
  updateConversationContext,
  updateReviewQueueItem
} from "./chat.service.js";

const chatRouter = Router();

/**
 * @swagger
 * /chat/conversations:
 *   get:
 *     tags: [Chat]
 *     summary: List the current user's conversations
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Array of conversation records }
 */
chatRouter.get(
  "/conversations",
  authenticate,
  validate(listConversationsQuerySchema),
  asyncHandler(async (req, res) => {
    const conversations = await listConversations(req.user.id, req.validated.query.limit);
    res.status(200).json({ conversations });
  })
);

/**
 * @swagger
 * /chat/conversations:
 *   post:
 *     tags: [Chat]
 *     summary: Create a new conversation
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *     responses:
 *       201: { description: Created conversation }
 */
chatRouter.post(
  "/conversations",
  authenticate,
  validate(createConversationSchema),
  asyncHandler(async (req, res) => {
    const conversation = await createConversation(req.user.id, req.validated.body.title);
    res.status(201).json({ conversation });
  })
);

/**
 * @swagger
 * /chat/conversations/{id}/messages:
 *   get:
 *     tags: [Chat]
 *     summary: Get all messages in a conversation
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Array of messages with citations }
 *       404: { description: Conversation not found }
 */
chatRouter.get(
  "/conversations/:id/messages",
  authenticate,
  validate(conversationParamsSchema),
  asyncHandler(async (req, res) => {
    const messages = await getConversationMessages(req.validated.params.id, req.user.id);
    res.status(200).json({ messages });
  })
);

/**
 * @swagger
 * /chat/messages:
 *   post:
 *     tags: [Chat]
 *     summary: Send a message and receive an AI response with citations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string }
 *               conversationId: { type: string, format: uuid }
 *               source: { type: string, enum: [text, voice], default: text }
 *     responses:
 *       201: { description: User message, AI response, and updated conversation }
 */
chatRouter.post(
  "/messages",
  authenticate,
  validate(createChatMessageSchema),
  asyncHandler(async (req, res) => {
    const SCOPED_ROLES = ["Department Editor", "Read Only"];
    const departmentId = SCOPED_ROLES.includes(req.user.role) ? (req.user.departmentId || null) : null;
    const result = await createChatTurn(req.user.id, req.validated.body, departmentId);
    res.status(201).json(result);
  })
);

/**
 * @swagger
 * /chat/conversations/{id}:
 *   delete:
 *     tags: [Chat]
 *     summary: Delete a conversation and all its messages
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Conversation not found }
 */
chatRouter.delete(
  "/conversations/:id",
  authenticate,
  validate(conversationParamsSchema),
  asyncHandler(async (req, res) => {
    await deleteConversation(req.validated.params.id, req.user.id);
    res.status(200).json({ message: "Conversation deleted." });
  })
);

// ── Streaming endpoint — Server-Sent Events ───────────────────────────────────
// Sends: citations event → token events (one per chunk) → done event
chatRouter.post(
  "/messages/stream",
  authenticate,
  validate(createChatMessageSchema),
  (req, res) => {
    const SCOPED_ROLES = ["Department Editor", "Read Only"];
    const departmentId = SCOPED_ROLES.includes(req.user.role) ? (req.user.departmentId || null) : null;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();

    const send = (data) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    // Handle client disconnect mid-stream
    let aborted = false;
    req.on("close", () => { aborted = true; });

    streamChatTurn(
      req.user.id,
      req.validated.body,
      departmentId,
      (citations) => { if (!aborted) send({ type: "citations", citations }); },
      (token)     => { if (!aborted) send({ type: "token", token }); },
      (result)    => {
        if (!aborted) {
          const suggestions = result.assistantMessage?.suggestions || [];
          send({ type: "done", ...result });
          if (suggestions.length) send({ type: "suggestions", suggestions });
        }
      }
    )
      .catch((err) => {
        console.error("streamChatTurn error:", err.message);
        send({ type: "error", message: "Failed to generate response. Please try again." });
      })
      .finally(() => {
        if (!res.writableEnded) res.end();
      });
  }
);

chatRouter.post(
  "/voice-sessions",
  authenticate,
  validate(createVoiceLogSchema),
  asyncHandler(async (req, res) => {
    const voiceLog = await createVoiceLog(req.user.id, req.validated.body);
    res.status(201).json({ voiceLog });
  })
);

// ── Budget context endpoints ─────────────────────────────────────────────────

chatRouter.get(
  "/conversations/:id/context",
  authenticate,
  validate(conversationParamsSchema),
  asyncHandler(async (req, res) => {
    const context = await getConversationContext(req.validated.params.id, req.user.id);
    res.status(200).json({ context });
  })
);

chatRouter.patch(
  "/conversations/:id/context",
  authenticate,
  validate(updateConversationContextSchema),
  asyncHandler(async (req, res) => {
    const conversation = await updateConversationContext(
      req.validated.params.id,
      req.user.id,
      req.validated.body
    );
    res.status(200).json({ conversation });
  })
);

// ── Message feedback (thumbs up/down) ────────────────────────────────────────

chatRouter.post(
  "/messages/:id/feedback",
  authenticate,
  asyncHandler(async (req, res) => {
    const feedback = await saveFeedback(req.params.id, req.user.id, req.body);
    res.status(200).json({ feedback });
  })
);

// ── "Show me why" — per-message explanation ──────────────────────────────────

chatRouter.get(
  "/messages/:id/explain",
  authenticate,
  asyncHandler(async (req, res) => {
    const explanation = await getMessageExplanation(req.params.id, req.user.id);
    res.status(200).json({ explanation });
  })
);

// ── Human review queue endpoints (Budget Analyst + Admin) ────────────────────

chatRouter.get(
  "/review-queue",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  asyncHandler(async (req, res) => {
    const status = req.query.status || "pending";
    const limit  = Math.min(Number(req.query.limit  || 50), 100);
    const offset = Number(req.query.offset || 0);
    const result = await listReviewQueue({ status, limit, offset });
    res.status(200).json(result);
  })
);

chatRouter.patch(
  "/review-queue/:id",
  authenticate,
  authorize("Admin", "Budget Analyst"),
  validate(updateReviewQueueSchema),
  asyncHandler(async (req, res) => {
    const item = await updateReviewQueueItem(
      req.validated.params.id,
      req.user.id,
      req.validated.body
    );
    res.status(200).json({ item });
  })
);

export { chatRouter };
