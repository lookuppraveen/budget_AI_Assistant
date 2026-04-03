export const nextHints = {
  dashboard: "Track high-level assistant health, adoption, and operational risk in one place.",
  reports: "Generate scheduled governance and executive reporting packs.",
  chat: "Connect chat to grounded retrieval with source citations.",
  email: "Configure Gmail, Microsoft 365, or SMTP and control attachment ingestion.",
  knowledge: "Ingest files, SharePoint repositories, and public links into the knowledge base.",
  audit: "Wire real analytics for confidence scores and risky answers.",
  admin: "Centralize master settings, users, roles, departments, and governance operations."
};

export const navItems = [
  { id: "chat", label: "AI Assistant", roles: ["Admin", "Budget Analyst", "Department Editor", "Read Only"] },
  { id: "dashboard", label: "Dashboard", roles: ["Admin", "Budget Analyst", "Department Editor", "Read Only"] },
  { id: "reports", label: "Reports", roles: ["Admin", "Budget Analyst", "Department Editor", "Read Only"] },
  { id: "manualreports", label: "Manual Reports", roles: ["Admin", "Budget Analyst", "Department Editor", "Read Only"] },
  { id: "email", label: "Email Assistant", roles: ["Admin", "Budget Analyst", "Department Editor"] },
  { id: "knowledge", label: "Knowledge Domains", roles: ["Admin", "Budget Analyst", "Department Editor"] },
  { id: "audit", label: "Citations & Audit", roles: ["Admin", "Budget Analyst"] },
  { id: "admin", label: "Admin Center", roles: ["Admin"] }
];

export const knowledgeDomains = [
  "Budget Policies",
  "Budget Procedures",
  "Historical Budgets",
  "Budget Training Materials",
  "Board Presentations",
  "Department Requests",
  "Budget Manager Correspondence",
  "Calendar & Deadlines",
  "Revenue Assumptions"
];

export const initialMessages = [
  {
    role: "assistant",
    text: "I can answer from budget policies, board summaries, training transcripts, and historical correspondence."
  }
];