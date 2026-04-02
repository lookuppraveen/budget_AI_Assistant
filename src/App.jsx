import { useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/layout/Header.jsx";
import Sidebar from "./components/layout/Sidebar.jsx";
import AuthPage from "./components/auth/AuthPage.jsx";
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

// Natural voices ranked — Microsoft Neural (Edge) > Google (Chrome) > system
const PREFERRED_VOICE_NAMES = [
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Microsoft Guy Online (Natural) - English (United States)",
  "Microsoft Ana Online (Natural) - English (United States)",
  "Microsoft Emma Online (Natural) - English (United States)",
  "Microsoft Brian Online (Natural) - English (United States)",
  "Google US English",
  "Microsoft Aria - English (United States)",
  "Microsoft Zira - English (United States)",
  "Samantha",   // macOS
  "Karen",      // macOS AU
  "Daniel",     // macOS UK
];

function pickBestVoice(voices) {
  for (const name of PREFERRED_VOICE_NAMES) {
    const match = voices.find((v) => v.name === name);
    if (match) return match;
  }
  return (
    voices.find((v) => v.lang === "en-US") ||
    voices.find((v) => v.lang?.startsWith("en")) ||
    null
  );
}

// Deep text cleanup — converts markdown + symbols to natural spoken language
function cleanTextForSpeech(raw) {
  return raw
    // Remove code blocks entirely
    .replace(/```[\s\S]*?```/g, "See the text response for the code details.")
    .replace(/`([^`\n]+)`/g, "$1")
    // Remove markdown headings, bold, italic, links
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1")
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/\[Source:[^\]]*\]/gi, "")
    // Convert bullet/numbered lists to sentences with natural flow
    .replace(/^\s*\d+\.\s+/gm, "Next, ")
    .replace(/^[\s]*[-•*]\s+/gm, "Also, ")
    // Expand common abbreviations to full spoken words
    .replace(/\be\.g\./gi, "for example,")
    .replace(/\bi\.e\./gi, "that is,")
    .replace(/\betc\./gi, "and so on")
    .replace(/\bvs\./gi, "versus")
    .replace(/\bapprox\./gi, "approximately")
    .replace(/\bDept\./gi, "Department")
    .replace(/\bFY(\d{2,4})/g, "Fiscal Year $1")
    .replace(/\bQ([1-4])\b/g, "Quarter $1")
    // Convert symbols to spoken equivalents
    .replace(/(\d[\d,]*)\s*%/g, "$1 percent")
    .replace(/\$\s*([\d,]+(\.\d+)?)/g, (_, n) => n + " dollars")
    .replace(/\s*&\s*/g, " and ")
    .replace(/#(\w)/g, "number $1")
    .replace(/\//g, " or ")
    // Add natural pauses around key transition words
    .replace(/\b(However|Moreover|Furthermore|Therefore|Additionally|In addition|That said|In summary|To summarize|Overall|Finally|First|Second|Third)\b/g, "... $1,")
    // Flatten newlines into sentence boundaries
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ", ")
    // Clean up punctuation artifacts
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*,/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Split cleaned text into sentences for multi-utterance natural delivery
function splitIntoSentences(text) {
  // Split on sentence-ending punctuation followed by space or end
  const raw = text.match(/[^.!?…]+[.!?…]+[\s]*/g) || [text];
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

// Tiny seeded-random variation so consecutive sentences differ slightly
// but the same sentence always sounds roughly similar (not wildly random)
function sentenceVariation(sentence, index) {
  const len = sentence.length;
  // Rate: 0.86–0.96 depending on sentence length (shorter = slightly faster)
  const rate = len < 40 ? 0.94 : len < 80 ? 0.90 : 0.86;
  // Pitch: gentle sine-wave variation across sentences gives natural cadence
  const pitchOffset = Math.sin(index * 1.3) * 0.05;
  const pitch = 1.06 + pitchOffset;
  return { rate, pitch };
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

  const [activePanel, setActivePanel] = useState("dashboard");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [conversationId, setConversationId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(true);
  const [twoWayMode, setTwoWayMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voice assistant ready.");

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
  const bestVoiceRef = useRef(null);

  const clearSession = () => {
    setSessionUser(null);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setActivePanel("dashboard");
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
    const hasSpeechSynthesis = "speechSynthesis" in window;

    if (!SpeechRecognition) {
      setVoiceStatus("Voice input is not supported in this browser.");
    }

    setSttSupported(Boolean(SpeechRecognition));
    setTtsSupported(hasSpeechSynthesis);

    // Load the best available TTS voice (voices load asynchronously in most browsers)
    if (hasSpeechSynthesis) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          bestVoiceRef.current = pickBestVoice(voices);
        }
      };
      loadVoices();
      window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    }

    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus("Listening for your budget question...");
      queueVoiceLog({ eventType: "stt_start", status: "listening" });
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
        setDraft(interimTranscript.trim());
      }

      const finalQuestion = finalTranscript.trim();
      if (finalQuestion && sendUserMessageRef.current) {
        queueVoiceLog({
          eventType: "user_utterance",
          direction: "user",
          transcript: finalQuestion,
          status: "captured"
        });
        sendUserMessageRef.current(finalQuestion, "voice");
      }
    };

    recognition.onerror = (event) => {
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
      queueVoiceLog({ eventType: "stt_end", status: "stopped" });

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

      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        // loadVoices is defined in the outer scope of this effect; removing
        // the generic listener is safe because we only added one per mount.
        window.speechSynthesis.onvoiceschanged = null;
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

  const speakAssistantReply = (text) => {
    if (!ttsSupported || !aiVoiceEnabledRef.current) return;

    const spokenText = cleanTextForSpeech(text);
    if (!spokenText) return;

    // Cancel any speech already in progress
    window.speechSynthesis.cancel();

    const sentences = splitIntoSentences(spokenText);
    if (sentences.length === 0) return;

    let sentenceIndex = 0;

    const speakNext = () => {
      // Stop if voice was muted mid-response
      if (!aiVoiceEnabledRef.current) {
        setIsSpeaking(false);
        return;
      }

      if (sentenceIndex >= sentences.length) {
        // All sentences done
        setIsSpeaking(false);
        setVoiceStatus(
          twoWayModeRef.current
            ? "Two-way mode active. Listening again..."
            : "Assistant response delivered."
        );
        if (shouldAutoListenRef.current) {
          window.setTimeout(safeStartListening, 450);
        }
        queueVoiceLog({ eventType: "tts_end", direction: "assistant", status: "completed" });
        return;
      }

      const sentence = sentences[sentenceIndex];
      const { rate, pitch } = sentenceVariation(sentence, sentenceIndex);
      sentenceIndex += 1;

      const utt = new SpeechSynthesisUtterance(sentence);
      utt.volume = 1;
      utt.rate = rate;
      utt.pitch = pitch;

      if (bestVoiceRef.current) {
        utt.voice = bestVoiceRef.current;
      }

      // First sentence triggers "speaking" state
      if (sentenceIndex === 1) {
        utt.onstart = () => {
          setIsSpeaking(true);
          setVoiceStatus("Assistant is speaking...");
          queueVoiceLog({ eventType: "tts_start", direction: "assistant", status: "speaking" });
        };
      }

      utt.onend = () => {
        // Small human-like gap between sentences (60–120ms)
        const pause = 60 + Math.random() * 60;
        window.setTimeout(speakNext, pause);
      };

      utt.onerror = (e) => {
        // Interrupted errors are normal when cancel() is called — ignore them
        if (e.error === "interrupted" || e.error === "canceled") return;
        setIsSpeaking(false);
        setVoiceStatus("Voice playback failed. Text response is still available.");
        queueVoiceLog({ eventType: "tts_error", direction: "assistant", status: "failed" });
      };

      window.speechSynthesis.speak(utt);
    };

    speakNext();
  };

  const sendUserMessage = async (rawMessage, source = "text") => {
    const message = rawMessage.trim();
    if (!message) {
      return;
    }

    if (source === "voice") {
      setVoiceStatus("Processing your voice question...");
    }

    setMessages((previous) => [...previous, { role: "user", text: message, source }]);
    setDraft("");

    try {
      const result = await sendChatMessage({
        token: sessionUser.token,
        conversationId: conversationIdRef.current || undefined,
        message,
        source
      });

      if (result.conversation?.id) {
        setConversationId(result.conversation.id);
      }

      const assistantReply = {
        role: result.assistantMessage?.role || "assistant",
        source: result.assistantMessage?.source || "text",
        citations: result.assistantMessage?.citations || [],
        text:
          result.assistantMessage?.text ||
          "I was unable to generate a response from saved history. Please try again."
      };

      setMessages((previous) => [...previous, assistantReply]);
      speakAssistantReply(assistantReply.text);
    } catch (error) {
      if (error?.statusCode === 401) {
        return;
      }

      const fallbackReply = {
        role: "assistant",
        source: "text",
        text: `I could not reach the chat service: ${error.message || "unknown error"}.`
      };
      setMessages((previous) => [...previous, fallbackReply]);
    }
  };

  sendUserMessageRef.current = sendUserMessage;

  const handleSubmit = async (event) => {
    event.preventDefault();
    await sendUserMessage(draft, "text");
  };

  const startListening = () => {
    shouldAutoListenRef.current = false;
    safeStartListening();
  };

  const toggleTwoWayMode = () => {
    const nextValue = !twoWayModeRef.current;
    setTwoWayMode(nextValue);
    setAiVoiceEnabled(true);
    aiVoiceEnabledRef.current = true;
    shouldAutoListenRef.current = nextValue;

    if (nextValue) {
      setVoiceStatus("Two-way mode enabled. Ask your budget question by voice.");
      queueVoiceLog({ eventType: "toggle_two_way", status: "enabled" });
      safeStartListening();
      return;
    }

    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
    }

    setVoiceStatus("Two-way mode disabled.");
    queueVoiceLog({ eventType: "toggle_two_way", status: "disabled" });
  };

  const toggleAiVoice = () => {
    const nextValue = !aiVoiceEnabledRef.current;
    setAiVoiceEnabled(nextValue);
    aiVoiceEnabledRef.current = nextValue;

    if (!nextValue && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setVoiceStatus("AI voice muted. Text responses continue.");
      return;
    }

    setVoiceStatus("AI voice enabled.");
  };

  const handleLogin = async ({ email, password, role }) => {
    try {
      const result = await loginApi({ email, password });

      if (result.user.role !== role) {
        return { ok: false, message: `Role mismatch. Account role is ${result.user.role}.` };
      }

      setSessionUser({ ...result.user, token: result.token });
      setActivePanel("dashboard");
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message || "Unable to login." };
    }
  };

  const handleSignup = async ({ name, email, password, role, departmentCode }) => {
    try {
      await signupApi({ name, email, password, role, departmentCode });
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
    return (
      <>
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <AuthPage
          onLogin={handleLogin}
          onSignup={handleSignup}
          onForgot={handleForgot}
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
              {activePanel === "dashboard" && <DashboardPanel authToken={sessionUser.token} />}

              {activePanel === "reports" && <ReportsPanel authToken={sessionUser.token} />}

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
                  onToggleAiVoice={toggleAiVoice}
                  onToggleTwoWayMode={toggleTwoWayMode}
                  onClearChat={() => {
                    setMessages(initialMessages);
                    setConversationId(null);
                    setDraft("");
                    if (window.speechSynthesis) window.speechSynthesis.cancel();
                  }}
                  onLoadConversation={(convId, msgs) => {
                    setConversationId(convId);
                    setMessages(msgs.map((m) => ({
                      role: m.role,
                      text: m.text || m.content || "",
                      source: m.source || "text",
                      citations: m.citations || []
                    })));
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
