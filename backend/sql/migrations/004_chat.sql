CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Budget Assistant Conversation',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message_at ON chat_conversations(last_message_at DESC);

DROP TRIGGER IF EXISTS trg_chat_conversations_set_updated_at ON chat_conversations;
CREATE TRIGGER trg_chat_conversations_set_updated_at
BEFORE UPDATE ON chat_conversations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  source TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('text', 'voice')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created_at ON chat_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS voice_session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'system' CHECK (direction IN ('user', 'assistant', 'system')),
  transcript TEXT,
  status TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_session_logs_user_id ON voice_session_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_session_logs_conversation_id ON voice_session_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_voice_session_logs_event_type ON voice_session_logs(event_type);
