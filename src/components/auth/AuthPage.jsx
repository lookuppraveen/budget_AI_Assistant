import { useState } from "react";

const roleOptions = ["Admin", "Budget Analyst", "Department Editor", "Read Only"];
const departmentOptions = [
  { name: "Budget Office", code: "BUD" },
  { name: "Finance", code: "FIN" },
  { name: "Academic Affairs", code: "ACA" },
  { name: "Student Services", code: "STD" }
];

export default function AuthPage({ onLogin, onSignup, onForgot, onReset, resetToken }) {
  const [mode, setMode] = useState(resetToken ? "reset" : "login");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [loginForm, setLoginForm] = useState({
    email: "admin@stlcc.edu",
    password: "Admin@12345",
    role: "Admin"
  });

  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Budget Analyst",
    departmentCode: "BUD"
  });

  const [forgotEmail, setForgotEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const submitLogin = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await onLogin(loginForm);
      if (!result.ok) {
        setMessage(result.message);
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
        setMessage(result.message);
        return;
      }

      setMessage("Signup successful. You can now log in with the new account.");
      setMode("login");
      setLoginForm((previous) => ({
        ...previous,
        email: signupForm.email,
        role: signupForm.role,
        password: signupForm.password
      }));
      setSignupForm({
        name: "",
        email: "",
        password: "",
        role: "Budget Analyst",
        departmentCode: "BUD"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitForgot = async (event) => {
    event.preventDefault();

    if (!forgotEmail.trim()) {
      setMessage("Enter your email to receive reset instructions.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onForgot({ email: forgotEmail.trim() });
      setMessage(result.message || `Reset instructions sent to ${forgotEmail}.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onReset({ token: resetToken, password: newPassword });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setMessage("Password reset successfully. You can now log in.");
      setNewPassword("");
      setConfirmPassword("");
      setMode("login");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-left">
        <p className="eyebrow">STLCC Budget Office</p>
        <h1>Budget Assistant Platform</h1>
        <p>
          Secure role-based access for admins, budget analysts, and departmental users with guided setup and
          governance controls.
        </p>
        <div className="auth-features">
          <span>Role-based dashboards</span>
          <span>Policy-grounded AI responses</span>
          <span>Audit-ready governance</span>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-tabs" role="tablist" aria-label="Auth modes">
          <button type="button" className={`tab-btn ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>
            Login
          </button>
          <button type="button" className={`tab-btn ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>
            Sign Up
          </button>
          <button type="button" className={`tab-btn ${mode === "forgot" ? "active" : ""}`} onClick={() => setMode("forgot")}>
            Forgot Password
          </button>
          {resetToken && (
            <button type="button" className={`tab-btn ${mode === "reset" ? "active" : ""}`} onClick={() => setMode("reset")}>
              Reset Password
            </button>
          )}
        </div>

        {message && <p className="auth-message">{message}</p>}

        {mode === "login" && (
          <form className="auth-form" onSubmit={submitLogin}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((previous) => ({ ...previous, email: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((previous) => ({ ...previous, password: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select
                value={loginForm.role}
                onChange={(event) => setLoginForm((previous) => ({ ...previous, role: event.target.value }))}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="action-btn auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Access Platform"}
            </button>
          </form>
        )}

        {mode === "signup" && (
          <form className="auth-form" onSubmit={submitSignup}>
            <label className="field">
              <span>Full Name</span>
              <input
                type="text"
                value={signupForm.name}
                onChange={(event) => setSignupForm((previous) => ({ ...previous, name: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={signupForm.email}
                onChange={(event) => setSignupForm((previous) => ({ ...previous, email: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={signupForm.password}
                onChange={(event) => setSignupForm((previous) => ({ ...previous, password: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Department</span>
              <select
                value={signupForm.departmentCode}
                onChange={(event) =>
                  setSignupForm((previous) => ({ ...previous, departmentCode: event.target.value }))
                }
              >
                {departmentOptions.map((department) => (
                  <option key={department.code} value={department.code}>
                    {department.name} ({department.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Role</span>
              <select
                value={signupForm.role}
                onChange={(event) => setSignupForm((previous) => ({ ...previous, role: event.target.value }))}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="action-btn auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Account"}
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form className="auth-form" onSubmit={submitForgot}>
            <label className="field">
              <span>Registered Email</span>
              <input
                type="email"
                value={forgotEmail}
                onChange={(event) => setForgotEmail(event.target.value)}
                placeholder="you@stlcc.edu"
                required
              />
            </label>
            <button type="submit" className="action-btn auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}

        {mode === "reset" && (
          <form className="auth-form" onSubmit={submitReset}>
            <p style={{ fontSize: "0.85rem", opacity: 0.7, marginBottom: "0.5rem" }}>
              Enter your new password below. Must be at least 8 characters with uppercase, lowercase, and a number.
            </p>
            <label className="field">
              <span>New Password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                required
              />
            </label>
            <label className="field">
              <span>Confirm Password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
                required
              />
            </label>
            <button type="submit" className="action-btn auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Resetting..." : "Set New Password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}