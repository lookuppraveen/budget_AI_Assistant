import { requestApi } from "./httpClient.js";

export async function listConversations(token) {
  return requestApi("/chat/conversations", { token });
}

export async function getConversationMessages(token, conversationId) {
  return requestApi(`/chat/conversations/${conversationId}/messages`, { token });
}

export async function sendChatMessage({ token, conversationId, message, source = "text" }) {
  return requestApi("/chat/messages", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify({
        conversationId,
        message,
        source
      })
    }
  });
}

export async function logVoiceSession({
  token,
  conversationId,
  eventType,
  direction = "system",
  transcript,
  status,
  durationMs,
  metadata
}) {
  return requestApi("/chat/voice-sessions", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify({
        conversationId,
        eventType,
        direction,
        transcript,
        status,
        durationMs,
        metadata
      })
    }
  });
}
