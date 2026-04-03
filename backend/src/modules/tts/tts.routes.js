import { Router } from "express";
import OpenAI from "openai";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { env } from "../../config/env.js";

const ttsRouter = Router();
ttsRouter.use(authenticate);

let openAiClient = null;
function getClient() {
  if (!openAiClient) openAiClient = new OpenAI({ apiKey: env.openAiApiKey });
  return openAiClient;
}

// POST /api/v1/tts/speak
// Body: { text: string, voice?: "alloy"|"echo"|"fable"|"onyx"|"nova"|"shimmer" }
// Returns: audio/mpeg stream
ttsRouter.post(
  "/speak",
  asyncHandler(async (req, res) => {
    const { text, voice = "nova" } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ message: "text is required" });
    }

    if (!env.openAiApiKey) {
      return res.status(503).json({ message: "TTS service not configured." });
    }

    // Truncate to 4096 chars — OpenAI TTS limit
    const cleanText = text.trim().slice(0, 4096);

    const response = await getClient().audio.speech.create({
      model: "tts-1",
      voice,
      input: cleanText,
      response_format: "mp3"
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  })
);

export { ttsRouter };
