// ── Feature cards — each with a unique accent color ──────────────────────────
const FEATURES = [
  {
    id: "chat",
    color: "linear-gradient(135deg, #003a70 0%, #0183c9 100%)",
    shadow: "rgba(1, 131, 201, 0.28)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
        <path d="M12 2a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
        <path d="M19 10a7 7 0 0 1-14 0" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
    label: "AI Budget Assistant",
    desc: "Ask budget questions in plain English and receive instant, policy-grounded answers sourced directly from your documents and historical data."
  },
  {
    id: "voice",
    color: "linear-gradient(135deg, #0f7c6e 0%, #38ef7d 100%)",
    shadow: "rgba(56, 239, 125, 0.25)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
        <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    ),
    label: "Voice-Enabled Conversations",
    desc: "Speak your budget questions and hear AI-generated responses — hands-free assistance with simultaneous voice and text output."
  },
  {
    id: "reports",
    color: "linear-gradient(135deg, #b85c00 0%, #fec83f 100%)",
    shadow: "rgba(254, 200, 63, 0.28)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    label: "Intelligent Report Generation",
    desc: "Generate professional budget reports and executive summaries in Word or PDF format, AI-assisted with policy-grounded content and formatting."
  },
  {
    id: "knowledge",
    color: "linear-gradient(135deg, #5b21b6 0%, #a78bfa 100%)",
    shadow: "rgba(167, 139, 250, 0.28)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
    label: "Knowledge Domains",
    desc: "Ingest budget policies, board presentations, historical budgets, training materials, and departmental documents into a searchable knowledge base."
  },
  {
    id: "email",
    color: "linear-gradient(135deg, #b91d73 0%, #f953c6 100%)",
    shadow: "rgba(249, 83, 198, 0.25)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
    label: "Email Intelligence",
    desc: "Connect your institution email to automatically ingest budget-related correspondence, attachments, and documents into the knowledge base."
  },
  {
    id: "audit",
    color: "linear-gradient(135deg, #1a7a35 0%, #78ba21 100%)",
    shadow: "rgba(120, 186, 33, 0.25)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    label: "Citations & Audit Trail",
    desc: "Every AI response is logged with source citations and confidence scores — providing a complete, defensible audit trail for governance and compliance."
  }
];

// ── Trust bar ─────────────────────────────────────────────────────────────────
const TRUST_ITEMS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    text: "Secure Role-Based Access"
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    text: "Real-Time AI Responses"
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    text: "Audit-Ready Governance"
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
    text: "Grounded in Your Documents"
  }
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function HomePage({ onGoToLogin }) {
  return (
    <div className="hp-root">

      {/* ══ Navigation Bar ════════════════════════════════════════════════════ */}
      <nav className="hp-nav">
        <div className="hp-nav-inner">
          <a className="hp-nav-brand" href="/" aria-label="STLCC Budget Assistant Home">
            <img
              src="/stlcc-logo-secondary.webp"
              alt="St. Louis Community College"
              className="hp-nav-logo"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </a>
          <button type="button" className="hp-nav-login" onClick={onGoToLogin}>
            Login
          </button>
        </div>
      </nav>

      {/* ══ Hero Section ══════════════════════════════════════════════════════ */}
      <section className="hp-hero" aria-labelledby="hp-hero-heading">
        <div className="hp-hero-blob hp-hero-blob-a" aria-hidden="true" />
        <div className="hp-hero-blob hp-hero-blob-b" aria-hidden="true" />

        <div className="hp-hero-inner">
          {/* ① Bigger eyebrow */}
          <p className="hp-hero-eyebrow">STLCC AI Operating Center</p>

          {/* ② Big hero heading */}
          <h1 id="hp-hero-heading" className="hp-hero-heading">
            Budget Assistant
          </h1>

          {/* ③ Sub-text removed per request */}

          <div className="hp-hero-cta">
            <button type="button" className="hp-btn-primary" onClick={onGoToLogin}>
              Login to Get Started
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* ══ Platform Capabilities Section ════════════════════════════════════ */}
      <section className="hp-features" aria-labelledby="hp-features-heading">
        <div className="hp-features-inner">
          <div className="hp-section-header">
            <p className="hp-section-eyebrow">Explore the Platform</p>
            {/* ④ Renamed from "Features" */}
            <h2 id="hp-features-heading" className="hp-section-heading">Platform Capabilities</h2>
            <p className="hp-section-sub">
              A complete suite of AI-powered tools built for budget professionals at
              St.&nbsp;Louis Community College.
            </p>
          </div>

          {/* ⑤ Colorful cards — each icon has its own gradient */}
          <div className="hp-features-grid">
            {FEATURES.map((f) => (
              <div key={f.id} className="hp-feature-card">
                <div
                  className="hp-feature-icon"
                  aria-hidden="true"
                  style={{
                    background: f.color,
                    boxShadow: `0 6px 20px ${f.shadow}`
                  }}
                >
                  {f.icon}
                </div>
                <h3 className="hp-feature-label">{f.label}</h3>
                <p className="hp-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Trust Strip ═══════════════════════════════════════════════════════ */}
      <section className="hp-trust" aria-label="Platform highlights">
        <div className="hp-trust-inner">
          {TRUST_ITEMS.map((item, i) => (
            <div key={i} className="hp-trust-item">
              <span className="hp-trust-icon" aria-hidden="true">{item.icon}</span>
              <span className="hp-trust-text">{item.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ══ Footer ════════════════════════════════════════════════════════════ */}
      <footer className="hp-footer">
        <div className="hp-footer-inner">
          <div className="hp-footer-brand">
            <img
              src="/stlcc-logo-secondary.webp"
              alt="St. Louis Community College"
              className="hp-footer-logo"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            <span className="hp-footer-brand-text">
              <span className="hp-footer-brand-name">Budget Assistant</span>
              <span className="hp-footer-brand-sub">AI Operating Center</span>
            </span>
          </div>
          {/* ⑥ Replaced "Powered by OpenAI" with something meaningful */}
          <p className="hp-footer-copy">
            © {new Date().getFullYear()} St. Louis Community College &nbsp;·&nbsp; Intelligent Budget Management for Higher Education
          </p>
        </div>
      </footer>

    </div>
  );
}
