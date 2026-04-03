import { useState } from "react";

const departmentOptions = [
  { name: "Budget Office", code: "BUD" },
  { name: "Finance", code: "FIN" },
  { name: "Academic Affairs", code: "ACA" },
  { name: "Student Services", code: "STD" }
];

const BENEFITS = [
  {
    icon: "🤖",
    title: "AI-Powered Budget Insights",
    desc: "Ask budget questions in plain English and get instant, policy-grounded answers from your documents and historical data."
  },
  {
    icon: "🔐",
    title: "Secure Role-Based Access",
    desc: "Every team member sees only what they need. Admins, analysts, editors, and viewers each get a tailored workspace."
  },
  {
    icon: "📊",
    title: "Intelligent Report Generation",
    desc: "Generate professional budget reports and summaries in Word or PDF format with AI-assisted content and formatting."
  },
  {
    icon: "🎙️",
    title: "Voice-Enabled Conversations",
    desc: "Use natural voice input to ask questions and hear responses — hands-free budget assistance, anytime."
  },
  {
    icon: "📋",
    title: "Audit-Ready Governance",
    desc: "Every AI interaction is logged with source citations, providing a complete, defensible audit trail."
  }
];

export default function AuthPage({ onLogin, onSignup, onForgot, onReset, resetToken }) {
  const [mode, setMode] = useState(resetToken ? "reset" : "login");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error"); // "error" | "success"
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [loginForm, setLoginForm] = useState({
    email: "admin@stlcc.edu",
    password: "Admin@12345"
  });

  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    password: "",
    departmentCode: "BUD"
  });

  const [forgotEmail, setForgotEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const showMsg = (msg, type = "error") => {
    setMessage(msg);
    setMessageType(type);
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await onLogin(loginForm);
      if (!result.ok) {
        showMsg(result.message);
        return;
      }
      setMessage("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitSignup = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await onSignup(signupForm);
      if (!result.ok) {
        showMsg(result.message);
        return;
      }
      showMsg("Account created. You can now log in.", "success");
      setMode("login");
      setLoginForm((prev) => ({ ...prev, email: signupForm.email, password: signupForm.password }));
      setSignupForm({ name: "", email: "", password: "", departmentCode: "BUD" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitForgot = async (event) => {
    event.preventDefault();
    if (!forgotEmail.trim()) {
      showMsg("Enter your email to receive reset instructions.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await onForgot({ email: forgotEmail.trim() });
      showMsg(result.message || `Reset instructions sent to ${forgotEmail}.`, "success");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      showMsg("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await onReset({ token: resetToken, password: newPassword });
      if (!result.ok) {
        showMsg(result.message);
        return;
      }
      showMsg("Password reset successfully. You can now log in.", "success");
      setNewPassword("");
      setConfirmPassword("");
      setMode("login");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      {/* ── Left panel ── */}
      <section className="auth-left">
        <div className="auth-brand">
          <div className="auth-brand-icon">💼</div>
          <div>
            <p className="auth-brand-org">STLCC Budget Office</p>
            <h1 className="auth-brand-title">Budget AI Assistant</h1>
          </div>
        </div>

        <p className="auth-tagline">
          Your intelligent platform for budget management, policy guidance, and governance — all in one place.
        </p>

        <div className="auth-benefits">
          {BENEFITS.map((b) => (
            <div key={b.title} className="auth-benefit-card">
              <span className="auth-benefit-icon">{b.icon}</span>
              <div>
                <p className="auth-benefit-title">{b.title}</p>
                <p className="auth-benefit-desc">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="auth-footer-note">
          Powered by OpenAI &nbsp;·&nbsp; Built for STLCC
        </p>
      </section>

      {/* ── Right panel (auth card) ── */}
      <section className="auth-card">
        <div className="auth-card-header">
          <h2 className="auth-card-title">
            {mode === "login" && "Welcome back"}
            {mode === "signup" && "Create an account"}
            {mode === "forgot" && "Reset your password"}
            {mode === "reset" && "Set new password"}
          </h2>
          <p className="auth-card-sub">
            {mode === "login" && "Sign in to access your dashboard"}
            {mode === "signup" && "Get started — access is granted by an admin"}
            {mode === "forgot" && "We'll send you a reset link"}
            {mode === "reset" && "Choose a strong new password"}
          </p>
        </div>

        {!resetToken && (
          <div className="auth-tabs" role="tablist">
            <button type="button" className={`tab-btn ${mode === "login" ? "active" : ""}`} onClick={() => { setMode("login"); setMessage(""); }}>
              Sign In
            </button>
            <button type="button" className={`tab-btn ${mode === "signup" ? "active" : ""}`} onClick={() => { setMode("signup"); setMessage(""); }}>
              Register
            </button>
            <button type="button" className={`tab-btn ${mode === "forgot" ? "active" : ""}`} onClick={() => { setMode("forgot"); setMessage(""); }}>
              Forgot Password
            </button>
          </div>
        )}

        {message && (
          <p className={`auth-message ${messageType === "success" ? "auth-message--success" : ""}`}>
            {message}
          </p>
        )}

        {/* ── Login ── */}
        {mode === "login" && (
          <form className="auth-form" onSubmit={submitLogin}>
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="you@stlcc.edu"
                required
                autoComplete="email"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Your password"
                required
                autoComplete="current-password"
              />
            </label>
            <button type="submit" className="action-btn auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign In"}
            </button>
          </form>
        )}

        {/* ── Signup ── */}
        {mode === "signup" && (
          <form className="auth-form" onSubmit={submitSignup}>
            <label className="field">
              <span>Full name</span>
              <input
                type="text"
                value={signupForm.name}
                onChange={(e) => setSignupForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Jane Smith"
                required
                autoComplete="name"
              />
            </label>
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                value={signupForm.email}
                onChange={(e) => setSignupForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="you@stlcc.edu"
                required
                autoComplete="email"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={signupForm.password}
                onChange={(e) => setSignupForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Min 8 chars, uppercase, number"
                required
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              <span>Department</span>
              <select
                value={signupForm.departmentCode}
                onChange={(e) => setSignupForm((p) => ({ ...p, departmentCode: e.target.value }))}
              >
                {departmentOptions.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </label>

            <div className="auth-role-notice">
              <span className="auth-role-notice-icon">ℹ️</span>
              <span>New accounts start with <strong>Read Only</strong> access. An admin can update your permissions after registration.</span>
            </div>

            <button type="submit" className="action-btn auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating account…" : "Create Account"}
            </button>
          </form>
        )}

        {/* ── Forgot password ── */}
        {mode === "forgot" && (
          <form className="auth-form" onSubmit={submitForgot}>
            <label className="field">
              <span>Registered email</span>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@stlcc.edu"
                required
                autoComplete="email"
              />
            </label>
            <button type="submit" className="action-btn auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send Reset Link"}
            </button>
          </form>
        )}

        {/* ── Reset password ── */}
        {mode === "reset" && (
          <form className="auth-form" onSubmit={submitReset}>
            <p className="auth-reset-hint">
              Enter your new password below. Must be at least 8 characters with an uppercase letter and a number.
            </p>
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                required
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                autoComplete="new-password"
              />
            </label>
            <button type="submit" className="action-btn auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Resetting…" : "Set New Password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
