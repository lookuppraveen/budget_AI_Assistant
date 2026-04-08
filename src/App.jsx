import { useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/layout/Header.jsx";
import Sidebar from "./components/layout/Sidebar.jsx";
import AuthPage from "./components/auth/AuthPage.jsx";
import HomePage from "./components/HomePage.jsx";
import DashboardPanel from "./components/panels/DashboardPanel.jsx";
import ReportsPanel from "./components/panels/ReportsPanel.jsx";
import ChatPanel from "./components/panels/ChatPanel.jsx";
import EmailPanel from "./components/panels/EmailPanel.jsx";
import KnowledgePanel from "./components/panels/KnowledgePanel.jsx";
import AuditPanel from "./components/panels/AuditPanel.jsx";
import AdminPanel from "./components/panels/AdminPanel.jsx";
import ManualReportsPanel from "./components/panels/ManualReportsPanel.jsx";
import { initialMessages, knowledgeDomains, navItems, nextHints } from "./data/uiContent.js";
import { getConversationMessages, listConversations, logVoiceSession, sendChatMessage } from "./services/api.js";
import { forgotPasswordApi, loginApi, resetPasswordApi, signupApi } from "./services/authApi.js";
import { SESSION_EXPIRED_EVENT } from "./services/httpClient.js";

const SESSION_STORAGE_KEY = "budget_ai_session";

// Extract ?token= from URL once on load (password reset flow)
const RESET_TOKEN = new URLSearchParams(window.location.search).get("token");

// ── TTS voice quality helpers ─────────────────────────────────────────────────

// Strip markdown/symbols so OpenAI TTS reads naturally
function cleanTextForSpeech(raw) {
  return raw
    .replace(/```[\s\S]*?```/g, "See the text response for code details.")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1")
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/\[Source:[^\]]*\]/gi, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^[\s]*[-•*]\s+/gm, "")
    .replace(/\be\.g\./gi, "for example,")
    .replace(/\bi\.e\./gi, "that is,")
    .replace(/\betc\./gi, "and so on")
    .replace(/\bvs\./gi, "versus")
    .replace(/\bFY(\d{2,4})/g, "Fiscal Year $1")
    .replace(/\bQ([1-4])\b/g, "Quarter $1")
    .replace(/(\d[\d,]*)\s*%/g, "$1 percent")
    .replace(/\$\s*([\d,]+(\.\d+)?)/g, (_, n) => n + " dollars")
    .replace(/\s*&\s*/g, " and ")
    .replace(/#(\w)/g, "number $1")
    .replace(/\//g, " or ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hasPanelAccess(role, panelId) {
  const panel = navItems.find((item) => item.id === panelId);
  if (!panel?.roles) {
    return true;
  }

  return panel.roles.includes(role);
}

function AccessDeniedPanel({ panelLabel }) {
  return (
    <article className="panel">
      <header className="panel-head">
        <h2>Access Restricted</h2>
        <p>
          You do not have permission to open <strong>{panelLabel}</strong>. Contact your administrator if access is
          required.
        </p>
      </header>
    </article>
  );
}

function parseJwtPayload(token) {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) {
      return null;
    }

    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = window.atob(normalized);
    return JSON.parse(json);
  } catch (_error) {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) {
    return false;
  }

  return Date.now() >= payload.exp * 1000;
}

export default function App() {
  const [sessionUser, setSessionUser] = useState(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (parsed?.token && parsed?.email && parsed?.role && !isTokenExpired(parsed.token)) {
        return parsed;
      }
    } catch (_error) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }

    return null;
  });

  // Show homepage (marketing) by default; switch to auth form when user clicks Login.
  // If there's a password-reset token in the URL, skip straight to the auth form.
  const [showAuth, setShowAuth] = useState(Boolean(RESET_TOKEN));

  const [activePanel, setActivePanel] = useState("chat");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [conversationId, setConversationId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(false);
  const [twoWayMode, setTwoWayMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Text chat active. Use icons below for voice.");

  const [isSending, setIsSending] = useState(false);

  const recognitionRef = useRef(null);
  const shouldAutoListenRef = useRef(false);
  const sendUserMessageRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const conversationIdRef = useRef(null);
  const aiVoiceEnabledRef = useRef(aiVoiceEnabled);
  const twoWayModeRef = useRef(twoWayMode);
  const isSpeakingRef = useRef(isSpeaking);
  const isListeningRef = useRef(isListening);
  const sttSupportedRef = useRef(sttSupported);
  // Tracks the currently playing OpenAI TTS audio so it can be stopped
  const currentAudioRef = useRef(null);
  // Tracks in-flight chat request so it can be aborted
  const chatAbortControllerRef = useRef(null);
  const speechDebounceRef = useRef(null);
  // Set to true to skip OpenAI TTS and always use browser SpeechSynthesis.
  // Flip to false here if the project API key gains TTS model access.
  const openAiTtsUnavailableRef = useRef(true);

  const clearSession = () => {
    setSessionUser(null);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setActivePanel("chat");
    setShowAuth(false); // Return to homepage after logout
  };

  const allowedNavItems = useMemo(() => {
    if (!sessionUser) {
      return [];
    }

    return navItems.filter((item) => !item.roles || item.roles.includes(sessionUser.role));
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionUser) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    if (isTokenExpired(sessionUser.token)) {
      setSessionUser(null);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionUser?.token) {
      return;
    }

    const verifyToken = () => {
      if (isTokenExpired(sessionUser.token)) {
        clearSession();
      }
    };

    verifyToken();
    const intervalId = window.setInterval(verifyToken, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [sessionUser]);

  useEffect(() => {
    const handleSessionExpired = () => {
      clearSession();
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    if (!allowedNavItems.length) {
      return;
    }

    const hasActive = allowedNavItems.some((item) => item.id === activePanel);
    if (!hasActive) {
      setActivePanel(allowedNavItems[0].id);
    }
  }, [allowedNavItems, activePanel]);

  useEffect(() => {
    aiVoiceEnabledRef.current = aiVoiceEnabled;
  }, [aiVoiceEnabled]);

  useEffect(() => {
    twoWayModeRef.current = twoWayMode;
  }, [twoWayMode]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    sttSupportedRef.current = sttSupported;
  }, [sttSupported]);

  useEffect(() => {
    sessionTokenRef.current = sessionUser?.token || null;
  }, [sessionUser]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const queueVoiceLog = ({
    eventType,
    direction = "system",
    transcript,
    status,
    durationMs,
    metadata
  }) => {
    if (!sessionTokenRef.current) {
      return;
    }

    logVoiceSession({
      token: sessionTokenRef.current,
      conversationId: conversationIdRef.current || undefined,
      eventType,
      direction,
      transcript,
      status,
      durationMs,
      metadata
    }).catch(() => {});
  };

  useEffect(() => {
    if (!sessionUser?.token) {
      setConversationId(null);
      setMessages(initialMessages);
      return;
    }

    let ignore = false;

    const loadConversation = async () => {
      try {
        const result = await listConversations(sessionUser.token);
        const latest = result.conversations?.[0];

        if (!latest || ignore) {
          if (!ignore) {
            setConversationId(null);
            setMessages(initialMessages);
          }
          return;
        }

        const history = await getConversationMessages(sessionUser.token, latest.id);

        if (ignore) {
          return;
        }

        setConversationId(latest.id);

        if (history.messages?.length) {
          setMessages(
            history.messages.map((message) => ({
              role: message.role,
              text: message.text,
              suggestions: message.suggestions || [],
              source: message.source,
              citations: message.citations || []
            }))
          );
          return;
        }

        setMessages(initialMessages);
      } catch (_error) {
        if (!ignore) {
          setConversationId(null);
          setMessages(initialMessages);
        }
      }
    };

    loadConversation();

    return () => {
      ignore = true;
    };
  }, [sessionUser]);

  const safeStartListening = () => {
    const recognition = recognitionRef.current;

    if (!recognition || !sttSupportedRef.current || isListeningRef.current) {
      return;
    }

    try {
      recognition.start();
    } catch (_error) {
      setVoiceStatus("Microphone is busy. Try again in a moment.");
    }
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceStatus("Voice input is not supported in this browser.");
    }

    setSttSupported(Boolean(SpeechRecognition));
    // TTS is always "supported" — we use OpenAI API, not browser synthesis
    setTtsSupported(true);

    if (!SpeechRecognition) {
      return;
    }

    let accumulatedTranscript = "";

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus("Listening for your budget question...");
    };

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript.trim()) {
        setDraft((accumulatedTranscript ? accumulatedTranscript + " " : "") + interimTranscript.trim());
      }

      const finalQuestion = finalTranscript.trim();
      if (finalQuestion && sendUserMessageRef.current) {
        accumulatedTranscript += (accumulatedTranscript ? " " : "") + finalQuestion;
        setDraft(accumulatedTranscript);

        // Stop recognition immediately on first final result so the mic
        // turns off and Chrome stops sending more events. The debounce then
        // waits a beat before submitting, giving the user a moment to see
        // their captured text before it sends.
        if (recognitionRef.current && isListeningRef.current) {
          recognitionRef.current.stop();
        }

        if (speechDebounceRef.current) {
          clearTimeout(speechDebounceRef.current);
        }

        speechDebounceRef.current = window.setTimeout(() => {
          const textToSend = accumulatedTranscript.trim();
          accumulatedTranscript = "";
          speechDebounceRef.current = null;
          queueVoiceLog({
            eventType: "user_utterance",
            direction: "user",
            transcript: textToSend,
            status: "captured"
          });
          sendUserMessageRef.current(textToSend, "voice");
        }, 800);
      }
    };

    recognition.onerror = (event) => {
      // "aborted" fires on Chrome when recognition.stop() is called in continuous mode — not a real error
      // "network" can fire transiently; treat silently so the UI doesn't alarm the user
      if (event.error === "aborted" || event.error === "network") {
        return;
      }

      setIsListening(false);

      if (event.error === "not-allowed") {
        setVoiceStatus("Microphone access denied. Please allow mic permission.");
        queueVoiceLog({ eventType: "stt_error", status: "not-allowed", metadata: { error: event.error } });
        return;
      }

      if (event.error === "no-speech") {
        setVoiceStatus("No voice detected. Try speaking again.");
        queueVoiceLog({ eventType: "stt_error", status: "no-speech", metadata: { error: event.error } });
        return;
      }

      setVoiceStatus("Voice capture failed. Please try again.");
      queueVoiceLog({ eventType: "stt_error", status: "failed", metadata: { error: event.error } });
    };

    recognition.onend = () => {
      setIsListening(false);
      // Only show "captured" status if a debounce is pending (meaning we
      // stopped intentionally after a final result, not from a manual stop)
      if (speechDebounceRef.current) {
        setVoiceStatus("Got it — sending your question...");
      }

      if (shouldAutoListenRef.current && !isSpeakingRef.current) {
        window.setTimeout(() => {
          safeStartListening();
        }, 250);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
      // Stop any playing OpenAI TTS audio on unmount
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  const nextHint = useMemo(() => nextHints[activePanel], [activePanel]);
  const activeNavItem = useMemo(() => navItems.find((item) => item.id === activePanel), [activePanel]);
  const voiceSupported = sttSupported || ttsSupported;

  const stopListening = () => {
    shouldAutoListenRef.current = false;

    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
    }

    setVoiceStatus("Voice listening paused.");
  };

  // Speak text using browser SpeechSynthesis (no API key needed)
  const speakWithBrowser = (spokenText, onAudioStarted) => {
    const synth = window.speechSynthesis;
    if (!synth) return false;

    synth.cancel(); // stop anything already speaking

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Prefer a natural English voice if available
    const voices = synth.getVoices();
    const preferred = voices.find((v) => v.lang.startsWith("en") && v.localService) || voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => {
      if (onAudioStarted) onAudioStarted();
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setVoiceStatus(
        twoWayModeRef.current
          ? "Two-way mode active. Listening again..."
          : "Assistant response delivered."
      );
      if (shouldAutoListenRef.current) {
        window.setTimeout(safeStartListening, 400);
      }
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      if (onAudioStarted) onAudioStarted();
    };

    synth.speak(utterance);
    return true;
  };

  const speakAssistantReply = async (text, onAudioStarted = null) => {
    if (!aiVoiceEnabledRef.current) {
      if (onAudioStarted) onAudioStarted();
      return;
    }

    const spokenText = cleanTextForSpeech(text);
    if (!spokenText) {
      if (onAudioStarted) onAudioStarted();
      return;
    }

    // Stop any audio already playing
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    setIsSpeaking(true);
    setVoiceStatus("Assistant is speaking...");

    // Try OpenAI TTS first; fall back to browser SpeechSynthesis on any error.
    // Once it fails once (403/500 = no model access), skip it for the rest of the session.
    if (sessionTokenRef.current && !openAiTtsUnavailableRef.current) {
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";
        const response = await fetch(`${apiBase}/tts/speak`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionTokenRef.current}`
          },
          body: JSON.stringify({ text: spokenText, voice: "nova" })
        });

        if (!response.ok) {
          openAiTtsUnavailableRef.current = true;
          throw new Error(`TTS ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          currentAudioRef.current = null;
          setIsSpeaking(false);
          setVoiceStatus(
            twoWayModeRef.current
              ? "Two-way mode active. Listening again..."
              : "Assistant response delivered."
          );
          if (shouldAutoListenRef.current) {
            window.setTimeout(safeStartListening, 400);
          }
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          currentAudioRef.current = null;
          speakWithBrowser(spokenText, null);
        };

        await audio.play();
        if (onAudioStarted) onAudioStarted();
        return;
      } catch (_err) {
        // OpenAI TTS unavailable — fall through to browser TTS and skip next time
        openAiTtsUnavailableRef.current = true;
      }
    }

    // Browser SpeechSynthesis fallback
    const started = speakWithBrowser(spokenText, onAudioStarted);
    if (!started) {
      if (onAudioStarted) onAudioStarted();
      setIsSpeaking(false);
      setVoiceStatus("Voice playback failed. Text response is still available.");
    }
  };

  const sendUserMessage = async (rawMessage, source = "text") => {
    const message = rawMessage.trim();
    if (!message) return;

    if (source === "voice") setVoiceStatus("Processing your voice question...");

    // Show user message immediately
    setMessages((prev) => [...prev, { role: "user", text: message, source }]);
    setDraft("");

    const abortController = new AbortController();
    chatAbortControllerRef.current = abortController;
    setIsSending(true);

    // Unique key to track the streaming placeholder message
    const streamingKey = `streaming-${Date.now()}`;

    // Add empty assistant placeholder so user sees "response incoming"
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: "", source: "text", citations: [], _streamingKey: streamingKey }
    ]);

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";
      const response = await fetch(`${apiBase}/chat/messages/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionUser.token}`
        },
        body: JSON.stringify({
          conversationId: conversationIdRef.current || undefined,
          message,
          source
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let receivedDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let data;
          try { data = JSON.parse(jsonStr); } catch (_) { continue; }

          if (data.type === "citations") {
            // Attach citations to placeholder as they arrive
            setMessages((prev) => prev.map((m) =>
              m._streamingKey === streamingKey ? { ...m, citations: data.citations } : m
            ));
          } else if (data.type === "token") {
            fullText += data.token;
            const snapshot = fullText;
            setMessages((prev) => prev.map((m) =>
              m._streamingKey === streamingKey ? { ...m, text: snapshot } : m
            ));
          } else if (data.type === "done") {
            receivedDone = true;
            if (data.conversation?.id) setConversationId(data.conversation.id);
            // Use the DB-stored text (JSON block already stripped) as the final text
            const cleanedText = data.assistantMessage?.text || fullText;
            const finalMsg = {
              ...(data.assistantMessage || {}),
              role: "assistant",
              text: cleanedText,
              citations: data.assistantMessage?.citations || [],
              suggestions: data.assistantMessage?.suggestions || [],
            };
            setMessages((prev) => prev.map((m) =>
              m._streamingKey === streamingKey ? finalMsg : m
            ));
            // Speak using the clean text (no JSON suffix)
            speakAssistantReply(cleanedText);
          } else if (data.type === "error") {
            throw new Error(data.message);
          }
        }
      }

      // Safety: if server closed without a done event, strip the streaming marker
      if (!receivedDone) {
        setMessages((prev) => prev.map((m) => {
          if (m._streamingKey !== streamingKey) return m;
          const { _streamingKey: _, ...rest } = m;
          return { ...rest, text: fullText || "Response incomplete. Please try again." };
        }));
      }

    } catch (error) {
      if (error?.name === "AbortError") {
        // Remove placeholder on user-initiated stop
        setMessages((prev) => prev.filter((m) => m._streamingKey !== streamingKey));
        return;
      }
      if (error?.status === 401 || error?.statusCode === 401) return;

      // Replace placeholder with error message
      setMessages((prev) => prev.map((m) =>
        m._streamingKey === streamingKey
          ? { role: "assistant", source: "text", text: `I could not reach the chat service: ${error.message || "unknown error"}.`, citations: [] }
          : m
      ));
    } finally {
      chatAbortControllerRef.current = null;
      setIsSending(false);
    }
  };

  sendUserMessageRef.current = sendUserMessage;

  const handleSubmit = async (event) => {
    event.preventDefault();
    await sendUserMessage(draft, "text");
  };

  const stopAll = () => {
    // Abort in-flight chat request
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
    }
    setIsSending(false);
    // Stop TTS audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
    // Stop STT
    if (isListeningRef.current) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    shouldAutoListenRef.current = false;
    setVoiceStatus("Stopped.");
  };

  // Mic-only mode: voice input → text response only. Disables voice output.
  const startListening = () => {
    shouldAutoListenRef.current = false;
    setAiVoiceEnabled(false);
    aiVoiceEnabledRef.current = false;
    safeStartListening();
  };

  // Voice + Text mode: enables voice output AND starts listening.
  // Turning it off reverts to text-only. Not continuous — user must click Mic or this button again to speak.
  const toggleTwoWayMode = () => {
    const nextValue = !twoWayModeRef.current;
    setTwoWayMode(nextValue);
    setAiVoiceEnabled(nextValue);
    aiVoiceEnabledRef.current = nextValue;
    shouldAutoListenRef.current = false; // not a continuous loop

    if (nextValue) {
      setVoiceStatus("Voice + Text mode on. Speak or type your question.");
      safeStartListening();
      return;
    }

    // Turning off: stop listening and any playing audio
    shouldAutoListenRef.current = false;
    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setVoiceStatus("Text chat active.");
  };

  const toggleAiVoice = () => {
    const nextValue = !aiVoiceEnabledRef.current;
    setAiVoiceEnabled(nextValue);
    aiVoiceEnabledRef.current = nextValue;

    if (!nextValue) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      setIsSpeaking(false);
      setVoiceStatus("AI voice muted. Text responses continue.");
      return;
    }

    setVoiceStatus("AI voice enabled.");
  };

  const handleLogin = async ({ email, password }) => {
    try {
      const result = await loginApi({ email, password });
      setSessionUser({ ...result.user, token: result.token });
      setActivePanel("chat");
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message || "Unable to login." };
    }
  };

  const handleSignup = async ({ name, email, password, departmentCode }) => {
    try {
      await signupApi({ name, email, password, departmentCode });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message || "Unable to create account." };
    }
  };

  const handleForgot = async ({ email }) => {
    try {
      const result = await forgotPasswordApi({ email });
      return { ok: true, message: result.message };
    } catch (error) {
      return { ok: false, message: error.message || "Unable to process request." };
    }
  };

  const handleReset = async ({ token, password }) => {
    try {
      await resetPasswordApi({ token, password });
      // Remove ?token= from the URL after a successful reset
      window.history.replaceState({}, "", window.location.pathname);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message || "Unable to reset password." };
    }
  };

  const handleLogout = () => {
    clearSession();
  };

  if (!sessionUser) {
    // Show the marketing homepage first; Login button flips showAuth → AuthPage
    if (!showAuth) {
      return <HomePage onGoToLogin={() => setShowAuth(true)} />;
    }

    return (
      <>
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <AuthPage
          onLogin={handleLogin}
          onSignup={handleSignup}
          onReset={handleReset}
          resetToken={RESET_TOKEN}
        />
      </>
    );
  }

  return (
    <>
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      <Header user={sessionUser} onLogout={handleLogout} />

      <main className="layout">
        <Sidebar
          activePanel={activePanel}
          navItems={allowedNavItems}
          nextHint={nextHint}
          onPanelChange={setActivePanel}
        />

        <section className="panel-wrap">
          {hasPanelAccess(sessionUser.role, activePanel) ? (
            <>
              {activePanel === "dashboard" && <DashboardPanel authToken={sessionUser.token} user={sessionUser} onNavigate={setActivePanel} />}

              {activePanel === "reports" && <ReportsPanel authToken={sessionUser.token} user={sessionUser} />}

              {activePanel === "manualreports" && (
                <ManualReportsPanel
                  authToken={sessionUser.token}
                  userRole={sessionUser.role}
                  userDepartmentId={sessionUser.departmentId || null}
                />
              )}

              {activePanel === "chat" && (
                <ChatPanel
                  authToken={sessionUser.token}
                  draft={draft}
                  messages={messages}
                  currentConversationId={conversationId}
                  isListening={isListening}
                  isSpeaking={isSpeaking}
                  isSending={isSending}
                  aiVoiceEnabled={aiVoiceEnabled}
                  twoWayMode={twoWayMode}
                  voiceStatus={voiceStatus}
                  voiceSupported={voiceSupported}
                  sttSupported={sttSupported}
                  ttsSupported={ttsSupported}
                  onDraftChange={setDraft}
                  onSubmit={handleSubmit}
                  onStartListening={startListening}
                  onStopListening={stopListening}
                  onStop={stopAll}
                  onToggleAiVoice={toggleAiVoice}
                  onToggleTwoWayMode={toggleTwoWayMode}
                  onClearChat={() => {
                    setMessages(initialMessages);
                    setConversationId(null);
                    setDraft("");
                    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; } setIsSpeaking(false);
                  }}
                  onLoadConversation={(convId, msgs) => {
                    setConversationId(convId);
                    setMessages(msgs.map((m) => ({
                      role: m.role,
                      text: m.text || m.content || "",
                      source: m.source || "text",
                      citations: m.citations || [],
                      suggestions: m.suggestions || []
                    })));
                  }}
                  onSuggestionClick={(suggestion) => {
                    setDraft(suggestion);
                    sendUserMessage(suggestion, "text");
                  }}
                />
              )}

              {activePanel === "email" && <EmailPanel authToken={sessionUser.token} />}

              {activePanel === "knowledge" && <KnowledgePanel domains={knowledgeDomains} authToken={sessionUser.token} />}

              {activePanel === "audit" && <AuditPanel authToken={sessionUser.token} />}

              {activePanel === "admin" && <AdminPanel authToken={sessionUser.token} />}
            </>
          ) : (
            <AccessDeniedPanel panelLabel={activeNavItem?.label || activePanel} />
          )}
        </section>
      </main>
    </>
  );
}
