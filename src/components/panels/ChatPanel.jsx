import { useEffect, useRef, useState } from "react";
import { deleteConversation, getConversationMessages, listConversations, updateConversationContext } from "../../services/api.js";
import { submitFeedback, getMessageExplanation } from "../../services/scenariosApi.js";

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

// Headphones icon — represents Voice + Text mode (voice in & voice out)
function IconVoiceText() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" width="24" height="24" aria-hidden="true">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
      <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
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

// ── Agent type labels ─────────────────────────────────────────────────────────
const AGENT_LABELS = {
  general:     "General",
  policy:      "Policy",
  analyst:     "Analyst",
  forecasting: "Forecasting",
  board:       "Executive",
  drafting:    "Drafting",
};
const AGENT_COLORS = {
  general:     "#6b7280",
  policy:      "#7c3aed",
  analyst:     "#2563eb",
  forecasting: "#d97706",
  board:       "#16a34a",
  drafting:    "#0891b2",
};

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
  onStop,
  onToggleAiVoice,
  onToggleTwoWayMode,
  onClearChat,
  onLoadConversation,
  onSuggestionClick,
  isListening,
  isSpeaking,
  isSending,
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
  const [deletingConvId, setDeletingConvId] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Feedback: { [messageId]: 1 | -1 }
  const [feedbackState, setFeedbackState] = useState({});
  // Explain: { [messageId]: { loading: bool, data: obj|null, open: bool } }
  const [explainState, setExplainState] = useState({});

  const handleFeedback = async (messageId, rating) => {
    if (!messageId || feedbackState[messageId]) return;
    setFeedbackState((prev) => ({ ...prev, [messageId]: rating }));
    try { await submitFeedback(authToken, messageId, { rating }); } catch (_e) { /* silent */ }
  };

  const handleToggleExplain = async (messageId) => {
    if (!messageId) return;
    const cur = explainState[messageId];
    if (cur?.open) {
      setExplainState((prev) => ({ ...prev, [messageId]: { ...cur, open: false } }));
      return;
    }
    if (cur?.data) {
      setExplainState((prev) => ({ ...prev, [messageId]: { ...cur, open: true } }));
      return;
    }
    setExplainState((prev) => ({ ...prev, [messageId]: { loading: true, data: null, open: false } }));
    try {
      const result = await getMessageExplanation(authToken, messageId);
      setExplainState((prev) => ({ ...prev, [messageId]: { loading: false, data: result.explanation, open: true } }));
    } catch (_e) {
      setExplainState((prev) => ({ ...prev, [messageId]: { loading: false, data: null, open: false } }));
    }
  };

  // ── Budget context bar ────────────────────────────────────────────────────
  const [showContextBar, setShowContextBar] = useState(false);
  const [ctxDept, setCtxDept] = useState("");
  const [ctxFundType, setCtxFundType] = useState("");
  const [ctxFiscalYear, setCtxFiscalYear] = useState("");
  const [ctxSaving, setCtxSaving] = useState(false);
  const [ctxSaved, setCtxSaved] = useState(false);

  const hasContext = ctxDept || ctxFundType || ctxFiscalYear;

  // Reset context fields when conversation changes
  useEffect(() => {
    setCtxDept("");
    setCtxFundType("");
    setCtxFiscalYear("");
    setCtxSaved(false);
  }, [currentConversationId]);

  const handleSaveContext = async () => {
    if (!currentConversationId || ctxSaving) return;
    setCtxSaving(true);
    try {
      const payload = {};
      if (ctxDept) payload.department = ctxDept;
      if (ctxFundType) payload.fundType = ctxFundType;
      if (ctxFiscalYear) payload.fiscalYear = ctxFiscalYear;
      await updateConversationContext(authToken, currentConversationId, payload);
      setCtxSaved(true);
      setTimeout(() => setCtxSaved(false), 2000);
    } catch (_e) {
      /* silent */
    } finally {
      setCtxSaving(false);
    }
  };

  const handleClearContext = () => {
    setCtxDept("");
    setCtxFundType("");
    setCtxFiscalYear("");
    setCtxSaved(false);
    if (currentConversationId) {
      updateConversationContext(authToken, currentConversationId, {}).catch(() => {});
    }
  };

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

  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation();
    if (deletingConvId) return;
    setDeletingConvId(convId);
    try {
      await deleteConversation(authToken, convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (currentConversationId === convId) {
        onClearChat();
      }
    } catch (_e) {
      /* silent */
    } finally {
      setDeletingConvId(null);
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
          <h2>AI Assistant</h2>
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

      {/* ── Budget context bar ─────────────────────────────────────── */}
      <div className="cp-ctx-strip">
        <button
          type="button"
          className={`cp-ctx-toggle ${hasContext ? "cp-ctx-toggle-active" : ""}`}
          onClick={() => setShowContextBar((v) => !v)}
          title="Set budget context (department, fund type, fiscal year) to ground AI responses"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
          {hasContext ? (
            <span className="cp-ctx-active-pill">
              {[ctxDept, ctxFundType, ctxFiscalYear].filter(Boolean).join(" · ")}
            </span>
          ) : (
            <span>Set Budget Context</span>
          )}
        </button>

        {showContextBar && (
          <div className="cp-ctx-bar">
            <div className="cp-ctx-fields">
              <label className="cp-ctx-field">
                <span>Department</span>
                <input
                  type="text"
                  value={ctxDept}
                  onChange={(e) => setCtxDept(e.target.value)}
                  placeholder="e.g. Financial Aid"
                  maxLength={80}
                />
              </label>
              <label className="cp-ctx-field">
                <span>Fund Type</span>
                <input
                  type="text"
                  value={ctxFundType}
                  onChange={(e) => setCtxFundType(e.target.value)}
                  placeholder="e.g. Operating, Capital"
                  maxLength={40}
                />
              </label>
              <label className="cp-ctx-field">
                <span>Fiscal Year</span>
                <input
                  type="text"
                  value={ctxFiscalYear}
                  onChange={(e) => setCtxFiscalYear(e.target.value)}
                  placeholder="e.g. FY2026"
                  maxLength={20}
                />
              </label>
            </div>
            <div className="cp-ctx-actions">
              <button
                type="button"
                className="cp-ctx-save-btn"
                onClick={handleSaveContext}
                disabled={!currentConversationId || ctxSaving || !hasContext}
              >
                {ctxSaving ? "Saving…" : ctxSaved ? "Saved!" : "Apply Context"}
              </button>
              {hasContext && (
                <button type="button" className="cp-ctx-clear-btn" onClick={handleClearContext}>
                  Clear
                </button>
              )}
              {!currentConversationId && (
                <span className="cp-ctx-hint">Start a conversation first to apply context.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Chat window ────────────────────────────────────────────── */}
      <div className="cp-messages" role="log" aria-live="polite">
        {messages.map((msg, i) => {
          const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
          const showSuggestions =
            isLastAssistant &&
            !msg._streamingKey &&
            msg.source !== "voice" &&
            Array.isArray(msg.suggestions) &&
            msg.suggestions.length > 0;

          const explainInfo = msg.id ? explainState[msg.id] : null;
          const myFeedback = msg.id ? feedbackState[msg.id] : null;

          return (
            <div key={`${msg.role}-${i}`} className={`cp-msg cp-msg-${msg.role}${msg._streamingKey ? " cp-msg-streaming" : ""}`}>
              <span className="cp-msg-label">{msg.role === "user" ? "You" : "Assistant"}</span>
              {/* Agent type badge */}
              {msg.role === "assistant" && msg.agentType && msg.agentType !== "general" && (
                <span style={{
                  display: "inline-block", marginLeft: 8, padding: "1px 7px", borderRadius: 10,
                  background: (AGENT_COLORS[msg.agentType] || "#6b7280") + "20",
                  color: AGENT_COLORS[msg.agentType] || "#6b7280",
                  fontSize: 11, fontWeight: 700, verticalAlign: "middle", marginBottom: 2
                }}>
                  {AGENT_LABELS[msg.agentType] || msg.agentType} Agent
                </span>
              )}
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
              {/* Feedback + Show me why (non-streaming assistant messages) */}
              {msg.role === "assistant" && !msg._streamingKey && msg.id && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    title="Helpful"
                    onClick={() => handleFeedback(msg.id, 1)}
                    style={{
                      padding: "3px 10px", border: "1px solid", borderRadius: 6, cursor: myFeedback ? "default" : "pointer",
                      fontSize: 12, background: myFeedback === 1 ? "#dcfce7" : "white",
                      borderColor: myFeedback === 1 ? "#16a34a" : "#d1d5db",
                      color: myFeedback === 1 ? "#16a34a" : "#6b7280"
                    }}
                  >
                    👍 {myFeedback === 1 ? "Helpful" : ""}
                  </button>
                  <button
                    type="button"
                    title="Not helpful"
                    onClick={() => handleFeedback(msg.id, -1)}
                    style={{
                      padding: "3px 10px", border: "1px solid", borderRadius: 6, cursor: myFeedback ? "default" : "pointer",
                      fontSize: 12, background: myFeedback === -1 ? "#fef2f2" : "white",
                      borderColor: myFeedback === -1 ? "#dc2626" : "#d1d5db",
                      color: myFeedback === -1 ? "#dc2626" : "#6b7280"
                    }}
                  >
                    👎 {myFeedback === -1 ? "Not helpful" : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleExplain(msg.id)}
                    style={{
                      padding: "3px 10px", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer",
                      fontSize: 12, background: explainInfo?.open ? "#eff6ff" : "white",
                      borderColor: explainInfo?.open ? "#2563eb" : "#d1d5db",
                      color: explainInfo?.open ? "#2563eb" : "#6b7280"
                    }}
                  >
                    {explainInfo?.loading ? "Loading…" : explainInfo?.open ? "Hide Why" : "Show me why"}
                  </button>
                  {explainInfo?.open && explainInfo?.data && (
                    <div style={{ width: "100%", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "12px 14px", marginTop: 4, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: "#0369a1", marginBottom: 6 }}>
                        {explainInfo.data.agentLabel}
                      </div>
                      <div style={{ color: "#374151", lineHeight: 1.5, marginBottom: 8 }}>{explainInfo.data.explanation}</div>
                      {explainInfo.data.topSourceExcerpt && (
                        <div style={{ color: "#6b7280", fontStyle: "italic", borderLeft: "2px solid #bae6fd", paddingLeft: 8 }}>
                          "{explainInfo.data.topSourceExcerpt}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {showSuggestions && (
                <div className="cp-suggestions">
                  {msg.suggestions.map((s, si) => (
                    <button
                      key={si}
                      type="button"
                      className="cp-suggestion-chip"
                      onClick={() => onSuggestionClick?.(s)}
                      disabled={isSending}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* ── Stop / Clear action bar ────────────────────────────────── */}
      <div className="cp-action-bar">
        <button
          type="button"
          className="cp-action-btn cp-stop-btn"
          onClick={onStop}
          disabled={!isSending && !isSpeaking && !isListening}
          title="Stop current response or voice activity"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
          Stop
        </button>
        <button
          type="button"
          className="cp-action-btn cp-clear-btn"
          onClick={onClearChat}
          disabled={messages.length <= 1}
          title="Clear chat and start fresh"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
          Clear
        </button>
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

        {/* Voice icons row — 2 modes below the text input */}
        {voiceSupported && (
          <div className="cp-voice-bar">
            <div className="cp-voice-icons">

              {/* Icon 1: Mic — voice input → text response only */}
              <div className="cp-vicon-wrap">
                <button
                  type="button"
                  className={`cp-vicon-btn cp-mic ${isListening && !twoWayMode ? "cp-active-green" : ""}`}
                  onClick={handleMicClick}
                  disabled={!sttSupported || twoWayMode}
                  title={isListening ? "Stop listening" : "Click to speak — response will be text only"}
                >
                  {isListening && !twoWayMode && <span className="cp-pulse" />}
                  <IconMic />
                </button>
                <span className="cp-vicon-label">
                  {isListening && !twoWayMode ? "Listening…" : "Voice Input"}
                </span>
              </div>

              {/* Icon 2: Voice + Text — voice input + voice & text response simultaneously */}
              <div className="cp-vicon-wrap">
                <button
                  type="button"
                  className={`cp-vicon-btn cp-twowaybtn ${twoWayMode ? (isSpeaking ? "cp-active-teal" : "cp-active-blue") : ""}`}
                  onClick={onToggleTwoWayMode}
                  disabled={!sttSupported || !ttsSupported}
                  title={twoWayMode ? "Disable Voice + Text mode" : "Enable Voice + Text mode — speak or type, get voice & text response"}
                >
                  {twoWayMode && isSpeaking && <span className="cp-pulse cp-pulse-teal" />}
                  {twoWayMode && isListening && !isSpeaking && <span className="cp-pulse" />}
                  <IconVoiceText />
                </button>
                <span className="cp-vicon-label">
                  {twoWayMode
                    ? isSpeaking ? "Speaking…" : isListening ? "Listening…" : "Voice + Text: On"
                    : "Voice + Text"}
                </span>
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
                <div key={conv.id} className="cp-drawer-item-wrap">
                  <button
                    type="button"
                    className={`cp-drawer-item ${conv.id === currentConversationId ? "cp-drawer-item-active" : ""}`}
                    onClick={() => handleSelectConversation(conv.id)}
                    disabled={!!loadingConvId || !!deletingConvId}
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
                  <button
                    type="button"
                    className="cp-drawer-delete"
                    title="Delete conversation"
                    disabled={!!loadingConvId || !!deletingConvId}
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                  >
                    {deletingConvId === conv.id ? "…" : "✕"}
                  </button>
                </div>
              ))}
            </div>
          </aside>
        </>
      )}
    </article>
  );
}
