import { useState } from "react";

const departmentOptions = [
  { name: "Budget Office", code: "BUD" },
  { name: "Finance", code: "FIN" },
  { name: "Academic Affairs", code: "ACA" },
  { name: "Student Services", code: "STD" }
];

export default function AuthPage({ onLogin, onSignup, onReset, resetToken }) {
  const [mode, setMode] = useState(resetToken ? "reset" : "login");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");
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

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const showMsg = (msg, type = "error") => {
    setMessage(msg);
    setMessageType(type);
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await onLogin(loginForm);
      if (!result.ok) showMsg(result.message);
      else setMessage("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitSignup = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await onSignup(signupForm);
      if (!result.ok) { showMsg(result.message); return; }
      showMsg("Account created. You can now sign in.", "success");
      setMode("login");
      setLoginForm((p) => ({ ...p, email: signupForm.email, password: signupForm.password }));
      setSignupForm({ name: "", email: "", password: "", departmentCode: "BUD" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { showMsg("Passwords do not match."); return; }
    setIsSubmitting(true);
    try {
      const result = await onReset({ token: resetToken, password: newPassword });
      if (!result.ok) { showMsg(result.message); return; }
      showMsg("Password reset successfully. You can now sign in.", "success");
      setNewPassword(""); setConfirmPassword("");
      setMode("login");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">

      {/* ── Left branding panel ─────────────────────────────────────── */}
      <section className="auth-left">
        <div className="auth-left-content">
          {/* Logo */}
          <img
            src="/stlcc-logo-secondary.webp"
            alt="St. Louis Community College"
            className="auth-left-logo"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />

          <div className="auth-left-divider" />

          <p className="auth-left-eyebrow">AI Operating Center</p>
          <h1 className="auth-left-title">Budget Assistant</h1>
          <p className="auth-left-tagline">
            Intelligent, policy-grounded budget management for St.&nbsp;Louis Community College.
          </p>

          {/* Key capability pills */}
          <ul className="auth-left-pills">
            <li>AI-Powered Budget Q&amp;A</li>
            <li>Voice-Enabled Conversations</li>
            <li>Intelligent Report Generation</li>
            <li>Audit-Ready Source Citations</li>
            <li>Secure Role-Based Access</li>
          </ul>
        </div>

        <p className="auth-left-footer">
          St.&nbsp;Louis Community College &nbsp;·&nbsp; AI Operating Center
        </p>
      </section>

      {/* ── Right auth card ─────────────────────────────────────────── */}
      <section className="auth-card">
        <div className="auth-card-header">
          <h2 className="auth-card-title">
            {mode === "login" && "Welcome back"}
            {mode === "signup" && "Create an account"}
            {mode === "reset" && "Set new password"}
          </h2>
          <p className="auth-card-sub">
            {mode === "login" && "Sign in to your STLCC Budget Assistant"}
            {mode === "signup" && "Register to request access"}
            {mode === "reset" && "Choose a strong new password"}
          </p>
        </div>

        {/* Tabs — only Login & Register */}
        {!resetToken && (
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              className={`tab-btn ${mode === "login" ? "active" : ""}`}
              onClick={() => { setMode("login"); setMessage(""); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`tab-btn ${mode === "signup" ? "active" : ""}`}
              onClick={() => { setMode("signup"); setMessage(""); }}
            >
              Register
            </button>
          </div>
        )}

        {message && (
          <p className={`auth-message ${messageType === "success" ? "auth-message--success" : ""}`}>
            {message}
          </p>
        )}

        {/* ── Sign In form ── */}
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

        {/* ── Register form ── */}
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
                  <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
                ))}
              </select>
            </label>
            <div className="auth-role-notice">
              <span className="auth-role-notice-icon">ℹ️</span>
              <span>New accounts start with <strong>Read Only</strong> access. An administrator will assign your role after review.</span>
            </div>
            <button type="submit" className="action-btn auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating account…" : "Create Account"}
            </button>
          </form>
        )}

        {/* ── Reset password (URL token flow only) ── */}
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
