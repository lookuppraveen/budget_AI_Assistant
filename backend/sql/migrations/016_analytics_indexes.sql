-- Speed up analytics dashboard queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_role_source_created
  ON chat_messages(role, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_role_created
  ON chat_messages(role, created_at DESC);

-- Partial index for assistant messages that have citations
CREATE INDEX IF NOT EXISTS idx_chat_messages_assistant_citations
  ON chat_messages(created_at DESC)
  WHERE role = 'assistant';
