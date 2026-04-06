import { useEffect, useState } from "react";
import { getDashboardAnalytics } from "../../services/insightsApi.js";

// ── Static role config ────────────────────────────────────────────────────────

const QUICK_ACTIONS = {
  Admin: [
    { label: "Manage Users", icon: "👥", panel: "admin", desc: "Add, edit, assign roles & departments" },
    { label: "Knowledge Domains", icon: "📚", panel: "knowledge", desc: "Upload and manage budget documents" },
    { label: "Citations & Audit", icon: "🔍", panel: "audit", desc: "Review AI answer quality & confidence" },
    { label: "Email Assistant", icon: "📧", panel: "email", desc: "Configure and process budget emails" },
    { label: "Run Reports", icon: "📊", panel: "reports", desc: "Generate governance & exec reports" },
    { label: "AI Assistant", icon: "💬", panel: "chat", desc: "Ask any budget question instantly" },
  ],
  "Budget Analyst": [
    { label: "AI Assistant", icon: "💬", panel: "chat", desc: "Get instant AI-powered budget answers" },
    { label: "Run Reports", icon: "📊", panel: "reports", desc: "Generate scheduled budget reports" },
    { label: "Manual Reports", icon: "📝", panel: "manualreports", desc: "Build custom budget reports" },
    { label: "Citations & Audit", icon: "🔍", panel: "audit", desc: "Verify AI answers with source citations" },
    { label: "Knowledge Domains", icon: "📚", panel: "knowledge", desc: "Browse policy & procedure documents" },
    { label: "Email Assistant", icon: "📧", panel: "email", desc: "Analyze and draft budget emails" },
  ],
  "Department Editor": [
    { label: "AI Assistant", icon: "💬", panel: "chat", desc: "Ask budget questions for your department" },
    { label: "Knowledge Domains", icon: "📚", panel: "knowledge", desc: "Upload and manage your dept documents" },
    { label: "Email Assistant", icon: "📧", panel: "email", desc: "Process and respond to budget emails" },
    { label: "Run Reports", icon: "📊", panel: "reports", desc: "View department budget reports" },
    { label: "Manual Reports", icon: "📝", panel: "manualreports", desc: "Create dept-specific custom reports" },
  ],
  "Read Only": [
    { label: "AI Assistant", icon: "💬", panel: "chat", desc: "Ask any budget question" },
    { label: "View Reports", icon: "📊", panel: "reports", desc: "Access available budget reports" },
    { label: "Manual Reports", icon: "📝", panel: "manualreports", desc: "View custom budget reports" },
  ],
};

const ROLE_HEADLINE = {
  Admin: "System Administration & Oversight",
  "Budget Analyst": "Budget Analysis & Reporting",
  "Department Editor": "Department Budget Management",
  "Read Only": "Budget Information Access",
};

const ROLE_DESCRIPTION = {
  Admin: "Monitor system health, manage users, oversee knowledge domains, and maintain governance.",
  "Budget Analyst": "Analyze budget data, generate reports, audit AI performance, and manage inquiries.",
  "Department Editor": "Upload department documents, handle budget queries, and create departmental reports.",
  "Read Only": "View budget reports, ask questions, and access current budget information.",
};

const BUDGET_CALENDAR = [
  { date: "Apr 15, 2026", label: "Q2 FY2026 Budget Submission Deadline", status: "urgent" },
  { date: "Apr 28, 2026", label: "Board Budget Presentation", status: "upcoming" },
  { date: "May 1, 2026", label: "FY2026 Mid-Year Review Opens", status: "upcoming" },
  { date: "May 31, 2026", label: "Department Budget Requests Due", status: "upcoming" },
  { date: "Jun 15, 2026", label: "Annual Audit Package Submission", status: "future" },
  { date: "Jul 1, 2026", label: "FY2027 Planning Cycle Begins", status: "future" },
];

const RECENT_ACTIVITY = [
  { time: "Today, 9:14 AM", event: "AI answered 8 budget queries from the Chat panel", type: "chat" },
  { time: "Today, 8:30 AM", event: "New document uploaded: FY2026 Operating Budget Guidelines.pdf", type: "doc" },
  { time: "Yesterday", event: "Monthly Executive Report generated and emailed to stakeholders", type: "report" },
  { time: "Yesterday", event: "3 email budget inquiries auto-resolved by AI Assistant", type: "email" },
  { time: "Apr 4, 2026", event: "Knowledge base updated: 5 new policy documents indexed", type: "doc" },
  { time: "Apr 3, 2026", event: "Audit review completed: 97% AI confidence on 42 answers", type: "audit" },
];

const SYSTEM_ALERTS_ADMIN = [
  { level: "info", msg: "2 users pending role assignment — review in Admin Center" },
  { level: "warn", msg: "Knowledge domain 'Board Presentations' has 3 documents awaiting indexing" },
  { level: "info", msg: "Q2 budget submission window opens in 9 days" },
];

// ── KPI card definitions per role ────────────────────────────────────────────

function buildKpis(role, data) {
  const kpis = data?.kpis || [];
  if (kpis.length >= 4 && kpis.some((k) => k.value !== "0" && k.value !== "0%")) {
    return kpis; // use live data if available
  }
  // Role-specific default KPIs
  if (role === "Admin") {
    return [
      { label: "AI Conversations Today", value: "—", trend: "Live", icon: "💬" },
      { label: "Active Users", value: "—", trend: "System", icon: "👥" },
      { label: "Knowledge Documents", value: "—", trend: "Indexed", icon: "📚" },
      { label: "Pending Admin Tasks", value: "2", trend: "Action needed", icon: "⚠️" },
    ];
  }
  if (role === "Budget Analyst") {
    return [
      { label: "My Queries This Week", value: "—", trend: "Your activity", icon: "💬" },
      { label: "Reports Generated", value: "—", trend: "This month", icon: "📊" },
      { label: "Avg AI Confidence", value: "—", trend: "Last 30 days", icon: "✅" },
      { label: "Open Items", value: "—", trend: "Needs review", icon: "📋" },
    ];
  }
  if (role === "Department Editor") {
    return [
      { label: "My Documents", value: "—", trend: "Uploaded", icon: "📄" },
      { label: "Queries This Month", value: "—", trend: "Your dept", icon: "💬" },
      { label: "Reports Available", value: "—", trend: "For your dept", icon: "📊" },
      { label: "Pending Uploads", value: "0", trend: "Up to date", icon: "📤" },
    ];
  }
  return [
    { label: "Available Reports", value: "—", trend: "View anytime", icon: "📊" },
    { label: "AI Sessions Today", value: "—", trend: "System-wide", icon: "💬" },
    { label: "Knowledge Topics", value: "9", trend: "Budget domains", icon: "📚" },
    { label: "Last System Update", value: "Today", trend: "Current", icon: "🔄" },
  ];
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardPanel({ authToken, user, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const role = user?.role || "Read Only";
  const email = user?.email || "";
  const displayName = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  useEffect(() => {
    async function load() {
      try {
        const response = await getDashboardAnalytics(authToken);
        setData(response.dashboard || null);
      } catch {
        // silently fall back to static content
      } finally {
        setLoading(false);
      }
    }
    if (authToken) load();
    else setLoading(false);
  }, [authToken]);

  const kpis = buildKpis(role, data);
  const actions = QUICK_ACTIONS[role] || QUICK_ACTIONS["Read Only"];
  const alerts = role === "Admin" ? SYSTEM_ALERTS_ADMIN : [];

  return (
    <article className="panel active">
      {/* ── Welcome Banner ─────────────────────────────────────── */}
      <div className="db-welcome-banner">
        <div className="db-welcome-left">
          <p className="db-welcome-date">{dateStr}</p>
          <h2 className="db-welcome-title">
            Welcome back{displayName ? `, ${displayName}` : ""}
          </h2>
          <p className="db-welcome-role">{ROLE_HEADLINE[role]}</p>
          <p className="db-welcome-desc">{ROLE_DESCRIPTION[role]}</p>
        </div>
        <div className="db-welcome-badge">
          <span className="db-role-badge">{role}</span>
        </div>
      </div>

      {/* ── System Alerts (Admin only) ─────────────────────────── */}
      {alerts.length > 0 && (
        <div className="db-alerts">
          {alerts.map((a, i) => (
            <div key={i} className={`db-alert db-alert-${a.level}`}>
              <span className="db-alert-icon">{a.level === "warn" ? "⚠️" : "ℹ️"}</span>
              {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* ── KPI Strip ─────────────────────────────────────────── */}
      {!loading && (
        <section className="db-kpi-row">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="db-kpi-card">
              <div className="db-kpi-icon">{kpi.icon}</div>
              <div className="db-kpi-body">
                <p className="db-kpi-label">{kpi.label}</p>
                <strong className="db-kpi-value">{kpi.value}</strong>
                <span className="db-kpi-trend">{kpi.trend}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Main Grid ─────────────────────────────────────────── */}
      <div className="db-main-grid">

        {/* Quick Actions */}
        <div className="db-card db-card-actions">
          <h3 className="db-card-title">Quick Actions</h3>
          <p className="db-card-subtitle">Jump directly to your most-used features</p>
          <div className="db-actions-grid">
            {actions.map((action) => (
              <button
                key={action.label}
                className="db-action-btn"
                onClick={() => onNavigate && onNavigate(action.panel)}
                type="button"
              >
                <span className="db-action-icon">{action.icon}</span>
                <span className="db-action-label">{action.label}</span>
                <span className="db-action-desc">{action.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Budget Calendar */}
        <div className="db-card db-card-calendar">
          <h3 className="db-card-title">Budget Calendar</h3>
          <p className="db-card-subtitle">Upcoming deadlines and milestones</p>
          <div className="db-calendar-list">
            {BUDGET_CALENDAR.map((item, i) => (
              <div key={i} className={`db-cal-item db-cal-${item.status}`}>
                <div className="db-cal-date">{item.date}</div>
                <div className="db-cal-label">{item.label}</div>
                {item.status === "urgent" && <span className="db-cal-badge">Action Required</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="db-card db-card-activity">
          <h3 className="db-card-title">Recent Activity</h3>
          <p className="db-card-subtitle">Latest system and team actions</p>
          <div className="db-activity-list">
            {RECENT_ACTIVITY.map((item, i) => (
              <div key={i} className="db-activity-item">
                <span className={`db-activity-dot db-dot-${item.type}`} />
                <div className="db-activity-body">
                  <p className="db-activity-event">{item.event}</p>
                  <span className="db-activity-time">{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Budget Topics (shown for Admin and Budget Analyst) */}
        {(role === "Admin" || role === "Budget Analyst") && (
          <div className="db-card db-card-topics">
            <h3 className="db-card-title">Top Budget Topics</h3>
            <p className="db-card-subtitle">Most queried subject areas this month</p>
            <div className="db-topics-list">
              {[
                { label: "Operating Budget Policies", pct: 82 },
                { label: "FY2026 Revenue Assumptions", pct: 74 },
                { label: "Department Budget Requests", pct: 61 },
                { label: "Historical Budget Comparisons", pct: 55 },
                { label: "Budget Training Procedures", pct: 48 },
                { label: "Board Presentation Guidelines", pct: 37 },
              ].map((t) => (
                <div key={t.label} className="db-topic-row">
                  <span className="db-topic-label">{t.label}</span>
                  <div className="db-topic-bar-wrap">
                    <div className="db-topic-bar" style={{ width: `${t.pct}%` }} />
                  </div>
                  <span className="db-topic-pct">{t.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Knowledge Domains Status */}
        <div className="db-card db-card-domains">
          <h3 className="db-card-title">Knowledge Domains</h3>
          <p className="db-card-subtitle">Budget information sources available</p>
          <div className="db-domains-grid">
            {[
              { name: "Budget Policies", count: "12 docs", status: "active" },
              { name: "Budget Procedures", count: "8 docs", status: "active" },
              { name: "Historical Budgets", count: "6 docs", status: "active" },
              { name: "Training Materials", count: "5 docs", status: "active" },
              { name: "Board Presentations", count: "4 docs", status: "active" },
              { name: "Department Requests", count: "9 docs", status: "active" },
              { name: "Correspondence", count: "15 docs", status: "active" },
              { name: "Calendar & Deadlines", count: "2 docs", status: "active" },
              { name: "Revenue Assumptions", count: "3 docs", status: "active" },
            ].map((d) => (
              <div key={d.name} className="db-domain-chip">
                <span className={`db-domain-dot db-domain-${d.status}`} />
                <div>
                  <p className="db-domain-name">{d.name}</p>
                  <p className="db-domain-count">{d.count}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </article>
  );
}
