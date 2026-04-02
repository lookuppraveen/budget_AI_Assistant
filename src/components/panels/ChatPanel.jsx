import { useEffect, useRef, useState } from "react";
import { getConversationMessages, listConversations } from "../../services/api.js";

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function IconMic() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" width="24" height="24" aria-hidden="true">
      <path d="M12 2a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
      <path d="M19 10a7 7 0 0 1-14 0" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function IconSpeakerOn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" width="24" height="24" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function IconSpeakerOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" width="24" height="24" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

function IconTwoWay() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" width="24" height="24" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────
function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ChatPanel({
  authToken,
  draft,
  messages,
  currentConversationId,
  onDraftChange,
  onSubmit,
  onStartListening,
  onStopListening,
  onToggleAiVoice,
  onToggleTwoWayMode,
  onClearChat,
  onLoadConversation,
  isListening,
  isSpeaking,
  aiVoiceEnabled,
  twoWayMode,
  voiceStatus,
  voiceSupported,
  sttSupported,
  ttsSupported
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadingConvId, setLoadingConvId] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load conversations when history drawer opens
  useEffect(() => {
    if (!showHistory || !authToken) return;
    setHistoryLoading(true);
    listConversations(authToken)
      .then(({ conversations: list }) => setConversations(list || []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [showHistory, authToken]);

  const handleSelectConversation = async (convId) => {
    if (loadingConvId) return;
    setLoadingConvId(convId);
    try {
      const { messages: msgs } = await getConversationMessages(authToken, convId);
      onLoadConversation(convId, msgs || []);
      setShowHistory(false);
    } catch (_e) {
      /* silent */
    } finally {
      setLoadingConvId(null);
    }
  };

  const handleMicClick = () => {
    isListening ? onStopListening() : onStartListening();
    inputRef.current?.focus();
  };

  return (
    <article className="panel active cp-root">

      {/* ── Top header ─────────────────────────────────────────────── */}
      <div className="cp-header">
        <div className="cp-header-left">
          <h2>Budget Chat Q&amp;A</h2>
          <p>Ask policy, historical, and departmental budget questions with source-grounded responses.</p>
        </div>
        <div className="cp-header-right">
          <button type="button" className="cp-top-btn" onClick={onClearChat} title="Start a new conversation">
            <IconPlus />
            <span>New Chat</span>
          </button>
          <button
            type="button"
            className={`cp-top-btn ${showHistory ? "cp-top-btn-active" : ""}`}
            onClick={() => setShowHistory((v) => !v)}
            title="View chat history"
          >
            <IconHistory />
            <span>History</span>
          </button>
        </div>
      </div>

      {/* ── Chat window ────────────────────────────────────────────── */}
      <div className="cp-messages" role="log" aria-live="polite">
        {messages.map((msg, i) => (
          <div key={`${msg.role}-${i}`} className={`cp-msg cp-msg-${msg.role}`}>
            <span className="cp-msg-label">{msg.role === "user" ? "You" : "Assistant"}</span>
            <p className="cp-msg-text">{msg.text}</p>
            {msg.source === "voice" && (
              <span className="cp-msg-badge">
                <IconMic /> Voice
              </span>
            )}
            {msg.role === "assistant" && Array.isArray(msg.citations) && msg.citations.length > 0 && (
              <div className="cp-citations">
                <p className="cp-citations-label">Sources</p>
                <ul>
                  {msg.citations.map((c) => (
                    <li key={c.id || c.title}>
                      <strong>{c.title}</strong>
                      {c.domain && <span className="cp-cite-tag">{c.domain}</span>}
                      {c.department && <span className="cp-cite-tag">{c.department}</span>}
                      {typeof c.score === "number" && (
                        <span className="cp-cite-score">{c.score.toFixed(2)}</span>
                      )}
                      {c.excerpt && <p className="cp-cite-excerpt">{c.excerpt}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* ── Input + voice bar ──────────────────────────────────────── */}
      <div className="cp-bottom">
        {/* Text input row */}
        <form className="cp-input-row" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="cp-input"
            placeholder="Type your budget question or use voice below…"
            autoComplete="off"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
          />
          <button type="submit" className="cp-send-btn" disabled={!draft.trim()}>
            Send
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>

        {/* Voice icons row — right-aligned, below input */}
        {voiceSupported && (
          <div className="cp-voice-bar">
            <div className="cp-voice-icons">

              {/* Mic */}
              <div className="cp-vicon-wrap">
                <button
                  type="button"
                  className={`cp-vicon-btn cp-mic ${isListening ? "cp-active-green" : ""}`}
                  onClick={handleMicClick}
                  disabled={!sttSupported}
                  title={isListening ? "Stop listening" : "Start voice input"}
                >
                  {isListening && <span className="cp-pulse" />}
                  <IconMic />
                </button>
                <span className="cp-vicon-label">{isListening ? "Listening…" : "Mic"}</span>
              </div>

              {/* Speaker */}
              <div className="cp-vicon-wrap">
                <button
                  type="button"
                  className={`cp-vicon-btn cp-speaker ${isSpeaking ? "cp-active-teal" : ""} ${!aiVoiceEnabled ? "cp-muted" : ""}`}
                  onClick={onToggleAiVoice}
                  disabled={!ttsSupported}
                  title={aiVoiceEnabled ? "Mute AI voice" : "Enable AI voice"}
                >
                  {isSpeaking && <span className="cp-pulse cp-pulse-teal" />}
                  {aiVoiceEnabled ? <IconSpeakerOn /> : <IconSpeakerOff />}
                </button>
                <span className="cp-vicon-label">
                  {isSpeaking ? "Speaking…" : aiVoiceEnabled ? "AI Voice" : "Muted"}
                </span>
              </div>

              {/* Two-way */}
              <div className="cp-vicon-wrap">
                <button
                  type="button"
                  className={`cp-vicon-btn cp-twowaybtn ${twoWayMode ? "cp-active-blue" : ""}`}
                  onClick={onToggleTwoWayMode}
                  disabled={!sttSupported || !ttsSupported}
                  title={twoWayMode ? "Disable two-way voice" : "Enable two-way voice"}
                >
                  <IconTwoWay />
                </button>
                <span className="cp-vicon-label">{twoWayMode ? "Two-Way: On" : "Two-Way"}</span>
              </div>
            </div>

            {/* Status text */}
            <p className="cp-voice-status">
              {(isListening || isSpeaking) && (
                <span className={`cp-live-dot ${isListening ? "green" : "teal"}`} />
              )}
              {voiceStatus}
            </p>
          </div>
        )}
      </div>

      {/* ── History drawer (right side) ────────────────────────────── */}
      {showHistory && (
        <>
          <div className="cp-drawer-backdrop" onClick={() => setShowHistory(false)} />
          <aside className="cp-drawer">
            <div className="cp-drawer-header">
              <span>Chat History</span>
              <button type="button" className="cp-drawer-close" onClick={() => setShowHistory(false)}>
                <IconClose />
              </button>
            </div>
            <div className="cp-drawer-body">
              {historyLoading && <p className="cp-drawer-empty">Loading...</p>}
              {!historyLoading && conversations.length === 0 && (
                <p className="cp-drawer-empty">No previous conversations yet.</p>
              )}
              {!historyLoading && conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  className={`cp-drawer-item ${conv.id === currentConversationId ? "cp-drawer-item-active" : ""}`}
                  onClick={() => handleSelectConversation(conv.id)}
                  disabled={!!loadingConvId}
                >
                  <span className="cp-drawer-item-icon">
                    <IconHistory />
                  </span>
                  <span className="cp-drawer-item-body">
                    <span className="cp-drawer-item-title">
                      {conv.title || "Budget Conversation"}
                    </span>
                    <span className="cp-drawer-item-time">
                      {formatTime(conv.last_message_at || conv.updated_at)}
                    </span>
                  </span>
                  {loadingConvId === conv.id && <span className="cp-drawer-item-loading">…</span>}
                </button>
              ))}
            </div>
          </aside>
        </>
      )}
    </article>
  );
}
