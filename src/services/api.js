import { requestApi } from "./httpClient.js";

export async function listConversations(token) {
  return requestApi("/chat/conversations", { token });
}

export async function getConversationMessages(token, conversationId) {
  return requestApi(`/chat/conversations/${conversationId}/messages`, { token });
}

export async function deleteConversation(token, conversationId) {
  return requestApi(`/chat/conversations/${conversationId}`, {
    token,
    options: { method: "DELETE" }
  });
}

export async function sendChatMessage({ token, conversationId, message, source = "text", signal }) {
  return requestApi("/chat/messages", {
    token,
    options: {
      method: "POST",
      body: JSON.stringify({
        conversationId,
        message,
        source
      }),
      ...(signal ? { signal } : {})
    }
  });
}

export async function updateConversationContext(token, conversationId, context) {
  return requestApi(`/chat/conversations/${conversationId}/context`, {
    token,
    options: { method: "PATCH", body: JSON.stringify(context) }
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
