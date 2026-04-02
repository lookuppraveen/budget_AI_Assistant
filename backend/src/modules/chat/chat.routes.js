import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { validate } from "../../middleware/validate.js";
import {
  conversationParamsSchema,
  createChatMessageSchema,
  createConversationSchema,
  createVoiceLogSchema,
  listConversationsQuerySchema
} from "./chat.schemas.js";
import {
  createChatTurn,
  createConversation,
  createVoiceLog,
  getConversationMessages,
  listConversations
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

chatRouter.post(
  "/voice-sessions",
  authenticate,
  validate(createVoiceLogSchema),
  asyncHandler(async (req, res) => {
    const voiceLog = await createVoiceLog(req.user.id, req.validated.body);
    res.status(201).json({ voiceLog });
  })
);

export { chatRouter };
