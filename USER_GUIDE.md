# Budget AI Assistant — User Guide

**Version 1.0 | April 2026**

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Dashboard](#3-dashboard)
4. [AI Assistant (Chat)](#4-ai-assistant-chat)
5. [Reports](#5-reports)
6. [Manual Reports](#6-manual-reports)
7. [Knowledge Domains (Documents)](#7-knowledge-domains-documents)
8. [Email Assistant](#8-email-assistant)
9. [Citations & Audit](#9-citations--audit)
10. [Admin Center](#10-admin-center)
11. [Frequently Asked Questions](#11-frequently-asked-questions)

---

## 1. Getting Started

### 1.1 Logging In

1. Open the application in your browser.
2. Enter your **Email Address** and **Password**, then click **Sign In**.
3. You will land on the **Chat** page by default.

> **Note:** If you do not have an account, contact your system administrator. New accounts are assigned the **Read Only** role until promoted.

---

### 1.2 Forgot Password

1. On the login screen, click **Forgot Password?**
2. Enter your registered email address and click **Send Reset Link**.
3. Check your inbox for a reset email (valid for **1 hour**).
4. Click the link in the email, enter your new password, and confirm.

---

### 1.3 Navigating the Application

The left-hand sidebar contains all main sections. Click any icon to switch panels. The active section is highlighted. Your name and role appear at the bottom of the sidebar.

---

## 2. User Roles & Permissions

The system has four roles. Your role determines which features you can access.

| Feature | Admin | Budget Analyst | Department Editor | Read Only |
|---|:---:|:---:|:---:|:---:|
| AI Assistant (Chat) | ✅ | ✅ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| View Reports | ✅ | ✅ | ✅ | ✅ |
| Create & Schedule Reports | ✅ | ✅ | ✅ | — |
| Manual Reports | ✅ | ✅ | ✅ | — |
| Upload Documents | ✅ | ✅ | ✅ (own dept) | — |
| Approve / Reject Documents | ✅ | ✅ | — | — |
| Email Assistant | ✅ | ✅ | ✅ | — |
| Citations & Audit | ✅ | ✅ | — | — |
| Admin Center | ✅ | — | — | — |

---

### Role Descriptions

**Admin**
Full control over the system — manage users, roles, departments, documents, and agent configuration.

**Budget Analyst**
Focused on analysis — generate reports, review AI answer quality, approve documents, and configure data sources.

**Department Editor**
Department-scoped — upload documents for their department, ask questions, and generate department reports.

**Read Only**
View only — can use the AI Assistant and browse available reports, but cannot upload, create, or configure anything.

---

## 3. Dashboard

The Dashboard is a personalized home screen showing relevant activity, KPIs, and quick links based on your role.

### 3.1 Admin Dashboard

| Card | Description |
|---|---|
| AI Conversations Today | Total chat sessions across all users today |
| Active Users | Users who have logged in recently |
| Knowledge Documents | Total approved documents in the knowledge base |
| Pending Admin Tasks | Items requiring administrator attention |

- **System Alerts** — notifications for pending user approvals, documents awaiting indexing, and upcoming deadlines.
- **Recent Activity** — a live feed of chats, uploads, report runs, and email syncs across the system.
- **Budget Calendar** — key budget dates and deadlines.
- **Quick Actions** — shortcut buttons to User Management, Knowledge Domains, Reports, and more.

---

### 3.2 Budget Analyst Dashboard

| Card | Description |
|---|---|
| My Queries This Week | Number of questions you have asked this week |
| Reports Generated | Reports created this month |
| Avg AI Confidence | Average confidence score of AI responses |
| Open Items | Documents or reports awaiting your review |

---

### 3.3 Department Editor Dashboard

| Card | Description |
|---|---|
| My Department Queries | Questions asked within your department |
| My Documents | Documents you have uploaded |
| Department Reports | Reports generated for your department |
| Pending Approvals | Documents pending review from your department |

---

### 3.4 Read Only Dashboard

| Card | Description |
|---|---|
| My Questions | Total questions you have asked |
| Available Reports | Reports you can view |
| My Conversations | Total chat sessions started |
| Knowledge Documents | Total approved documents in the system |

---

## 4. AI Assistant (Chat)

The AI Assistant is the core feature of the application. Ask any budget-related question in plain English and receive a response grounded in your organization's approved documents.

---

### 4.1 Asking a Text Question

1. Click the **AI Assistant** icon in the sidebar.
2. Type your question in the message box at the bottom.
3. Press **Enter** or click the **Send** button (arrow icon).
4. The AI response appears in the chat window, along with source citations.

**Example questions:**
- *"What is the current budget allocation for the IT department?"*
- *"Show me the variance between Q1 planned and actual spend."*
- *"What are the capital expenditure policies for FY2026?"*

---

### 4.2 Understanding the Response

Each AI response includes:

- **Answer text** — a clear, plain-English response.
- **Source Citations** — the documents the AI used to generate the answer, including document title, domain, and relevance score.

> The AI only answers based on approved documents in the knowledge base. If a topic is not covered, the AI will say so rather than guess.

---

### 4.3 Voice Input (Speak Your Question)

Instead of typing, you can speak your question.

1. Click the **microphone** button (🎤) in the chat bar.
2. Speak your question clearly.
3. When you pause, the system detects you have finished and automatically sends the question.
4. The mic turns off and "Got it — sending your question..." appears briefly.

**Tips for voice input:**
- Speak at a normal pace — the system waits for a natural pause before sending.
- Works best in Chrome and Edge browsers.
- Grant microphone permission when prompted by your browser.

---

### 4.4 Voice + Text Response

Click the **Voice + Text Response** button to have the AI read its answer aloud while also displaying the text.

- The voice response begins playing, then the text appears.
- You can mute or stop playback at any time.
- Uses browser speech synthesis — no additional setup required.

---

### 4.5 Two-Way Voice Mode

Two-Way Voice enables a fully hands-free conversation loop:

1. Click the **Two-Way Mode** toggle button.
2. Speak your question — the mic activates automatically.
3. The AI responds with voice.
4. After the AI finishes speaking, the mic activates again automatically.
5. Continue asking follow-up questions without touching the keyboard.
6. Click the toggle again to exit Two-Way Mode.

**Best used for:** Meetings, walkthroughs, or when your hands are occupied.

---

### 4.6 Conversation History

- Previous conversations are listed in the left panel of the chat screen.
- Click any conversation to reload it and continue from where you left off.
- Click **New Chat** to start a fresh session.

---

## 5. Reports

The Reports section lets you create, schedule, run, and export budget reports.

---

### 5.1 Overview Tab

The Overview tab shows two live charts:

- **Reports Generated Per Month** — a bar chart of the last 6 months of report activity, pulled live from the database.
- **Report Status Overview** — a donut chart showing the breakdown of reports by status (Ready, Scheduled, In Progress, Failed).

Click **↻ Refresh** to reload both charts with the latest data.

**KPI Strip** (top of the page):

| Card | Description |
|---|---|
| Total Reports | All reports in the system |
| Ready to View | Reports that have been completed and are available |
| Scheduled | Reports set to run automatically |
| In Progress | Reports currently being created or drafted |

---

### 5.2 Creating a Report

1. Click **+ Create Report** (top-right, Admin and Budget Analyst only).
2. Enter a **Report Name**.
3. Select the **Report Type** from the dropdown:
   - Budget Summary
   - Department Budget
   - Variance Analysis *(Admin, Budget Analyst)*
   - Board & Executive Report *(Admin, Budget Analyst)*
   - AI Usage & Insights *(Admin, Budget Analyst)*
   - Compliance & Audit *(Admin only)*
4. Choose a **Frequency** (Daily, Weekly, Monthly, Quarterly, One-Time).
5. Click **Create**.

The report is created in **Draft** status.

---

### 5.3 My Reports Tab

Shows all reports you have created. Each card displays:

- Report name and type
- Status badge (Ready / Scheduled / In Progress / Failed)
- Last run date
- Action buttons: **Run Now**, **Schedule**, **Delete**

---

### 5.4 Running a Report

Click **Run Now** on any report card to generate the report immediately. The status will update to **Ready** when complete.

---

### 5.5 Scheduling a Report

1. Click **Schedule** on a report card.
2. Choose a schedule from the dropdown:
   - Every Monday morning
   - 1st of every month
   - Every weekday morning
   - Every quarter (Jan, Apr, Jul, Oct)
   - Custom (enter a cron expression)
3. Click **Save Schedule**.

The report status changes to **Scheduled** and will run automatically at the chosen time.

---

### 5.6 Exporting Reports

Click **⬇ Export All** to download all reports as an Excel file (.xlsx).

---

## 6. Manual Reports

Manual Reports let you generate a one-time, AI-written report for a specific purpose, formatted for immediate use.

---

### 6.1 Available Report Types

| Report Type | Best For |
|---|---|
| Board Summary | Non-technical board and executive audience |
| Tax Filing Summary | Fund classification and compliance documentation |
| Department Budget Report | All policies and procedures for a single department |
| Policy Compliance Report | Coverage assessment and gap analysis |
| Fiscal Year Review | Budget policies for a full fiscal year |
| Audit Trail Report | Formal audit-ready documentation |
| Custom Report | User-defined instructions and scope |

---

### 6.2 Generating a Manual Report

1. Click **Manual Reports** in the sidebar.
2. Select a **Report Type** from the dropdown.
3. *(Optional)* Choose a **Domain** (e.g., Budget Policies, Historical Budgets).
4. *(Optional)* Choose a **Department**.
5. *(Optional)* Select a **Fiscal Year** or date range.
6. Add any **notes or specific guidance** for the AI (e.g., "Focus on capital expenditure only").
   - Click suggestion chips to auto-append common guidance.
7. Enter or confirm the **Report Title**.
8. Click **Generate**.

The AI will write the report using approved documents as sources. Review the output, then download or save.

---

### 6.3 Downloading a Manual Report

After generation, click **Download** to save the report as a formatted document.

---

## 7. Knowledge Domains (Documents)

The Knowledge Domains section is the library of documents the AI uses to answer questions and generate reports. All AI responses are grounded exclusively in documents approved here.

---

### 7.1 Knowledge Domains

Documents are organized into nine domains:

| Domain | Examples |
|---|---|
| Budget Policies | Policy manuals, approval policies |
| Budget Procedures | Step-by-step process guides |
| Historical Budgets | Prior year actuals and projections |
| Budget Training Materials | Training decks, onboarding guides |
| Board Presentations | Slide decks, board meeting materials |
| Department Requests | Budget requests, proposals |
| Budget Manager Correspondence | Emails, memos, letters |
| Calendar & Deadlines | Key dates, submission schedules |
| Revenue Assumptions | Forecast assumptions, revenue models |

---

### 7.2 Uploading a Document

*(Admin, Budget Analyst, Department Editor)*

1. Click **Knowledge Domains** in the sidebar.
2. Go to the **Upload Documents** tab.
3. Select the **Domain** and **Department**.
4. Drag and drop your file onto the upload area, or click **Browse** to select a file.
   - Supported formats: **PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, CSV, TXT**
5. Click **Submit**.

The document enters **Pending** status until reviewed and approved.

---

### 7.3 Document Approval Workflow

*(Admin and Budget Analyst only)*

Documents must be approved before the AI can use them.

1. Go to the **Ingestion Queue** tab.
2. Review pending documents.
3. For each document:
   - Click **Approve** to add it to the knowledge base (triggers indexing).
   - Click **Reject** to decline (with optional notes).
   - Click **Hold** to pause review.
4. Approved documents are automatically indexed and available to the AI.

---

### 7.4 Connecting SharePoint

*(Admin, Budget Analyst)*

1. Go to the **SharePoint Repository** tab.
2. Enter your **Tenant ID**, **Client ID**, **Client Secret**, **Site URL**, and **Library Path**.
3. Click **Test Connection** to verify.
4. Click **Sync** to import documents from SharePoint.

Synced documents appear in the Ingestion Queue for approval.

---

### 7.5 Adding a Public Link

1. Go to the **Public Links** tab.
2. Enter the **URL** of a publicly accessible web page.
3. Select the **Domain** and **Department**.
4. Enter an optional custom title.
5. Click **Ingest**.

The system extracts the text from the page and adds it to the queue for approval.

---

### 7.6 Searching the Knowledge Base

1. Go to the **Search Knowledge** tab.
2. Type keywords or a question in the search box.
3. Filter by **Domain** or **Department**.
4. Results show document excerpts with relevance scores.
5. Click **Download** on any result to view the full document.

---

### 7.7 Domain Coverage

The **Domain Coverage** tab shows a visual count of approved documents in each domain. Use this to identify gaps (domains with few or no documents) that may affect AI answer quality.

---

## 8. Email Assistant

The Email Assistant connects your email inbox to the knowledge base, automatically extracting budget-related attachments and making them available to the AI.

---

### 8.1 Configuring Email

*(Admin, Budget Analyst, Department Editor)*

1. Click **Email Assistant** in the sidebar.
2. Select your **Email Provider**:
   - **Gmail** — requires App Password
   - **Microsoft 365** — requires Tenant ID, Client ID, and Client Secret
   - **SMTP / IMAP** — standard email server credentials
3. Enter the required credentials.
4. Click **Test Connection** to verify.
5. Select which **attachment types** to ingest (PDF, DOCX, XLSX, PPTX, CSV, TXT).
6. Toggle **Auto-Tag** on if you want attachments categorized automatically.
7. Click **Save**.

---

### 8.2 Syncing Emails

After configuration, click **Sync Now** to pull emails and extract attachments. The sync dashboard shows:

- Total emails synced
- Total attachments ingested
- Last sync timestamp

Ingested attachments appear in the Knowledge Domains **Ingestion Queue** for review and approval.

---

## 9. Citations & Audit

*(Admin and Budget Analyst only)*

The Citations & Audit panel provides a full governance trail of AI activity, document events, and system changes.

---

### 9.1 Audit Metrics

| Card | Description |
|---|---|
| AI Conversations Analyzed | Total chat sessions reviewed |
| Avg Confidence Score | Average AI response confidence across all sessions |
| Documents Approved | Total approved document actions |
| High-Risk Items Flagged | Responses or documents flagged for review |

---

### 9.2 Activity Log

The activity log records every significant action in the system. Filter by:

- **Entity Type:** User, Document, Email Integration, SharePoint Integration
- **Action:**

| Action | Description |
|---|---|
| Login | User signed into the system |
| User Updated | Role or department change |
| Doc Approved | Document approved and indexed |
| Doc Rejected | Document rejected |
| Doc On Hold | Document placed on hold |
| Email Sync | Email inbox was synced |
| SharePoint Sync | SharePoint library was synced |

Each entry shows: timestamp, actor name, and action details.

---

## 10. Admin Center

*(Admin only)*

The Admin Center contains all system configuration tools, organized into eight tabs.

---

### 10.1 Master Data

Define the reference data values used throughout the system:

- Fund Types
- Fiscal Years
- Request Statuses
- Expense Categories
- Other custom data types

For each type, you can add, edit, activate, or deactivate values.

---

### 10.2 User Management

View and manage all users in the system.

| Action | How |
|---|---|
| View all users | Open the User Management tab |
| Change a user's role | Click the role dropdown next to the user |
| Change a user's department | Click the department dropdown |
| Activate / Deactivate a user | Toggle the active switch |

> New users who sign up are assigned the **Read Only** role by default. Promote them to a higher role as needed.

---

### 10.3 Role Settings

- View all roles and the permissions assigned to each.
- Create **custom roles** with specific permission sets.
- Edit custom roles (system roles cannot be modified).
- Delete custom roles that have no users assigned.

**Available Permissions:** Master Data, Users, Roles, Departments, Audit, Documents, Wizard, Knowledge, Email, Reports, Requests.

---

### 10.4 Departments

Manage organization departments.

| Action | How |
|---|---|
| Create a department | Click **+ New Department**, enter Name, Code, and Owner |
| Edit a department | Click the edit icon next to any department |
| Delete a department | Click delete (only if no users or documents are assigned) |

Departments are used to scope documents and restrict Department Editors to their own department's data.

---

### 10.5 Document Management

A full overview of every document in the system, with the ability to:

- Approve, Reject, or Hold documents
- Download full documents
- Re-upload a document
- Delete documents
- Bulk reindex the knowledge base

---

### 10.6 Agent Config Wizard

A 12-step guided wizard to configure the AI assistant's behavior for each department. Steps include:

1. Define the agent's purpose and scope
2. Set hard boundaries (what the AI will not answer)
3. Identify primary users and their core needs
4. List the top questions and tasks
5. Select approved knowledge sources
6. Specify excluded content
7. Set ingestion and indexing rules
8. Configure guidance-only behavior
9. Set guardrails and risk warnings
10. Run scenario tests
11. Define validation criteria
12. Create a revision plan

Each department can have its own agent configuration saved and updated over time.

---

### 10.7 Agent Assignments

Assign configured agents to departments, edit existing agent configurations, and manage the full agent workflow.

---

### 10.8 Operations

Monitor system health:

- **Retrieval Health** — status of the vector search system
- **Scheduler Status** — status of scheduled report jobs
- **Retrieval Runs Log** — detailed log of recent AI retrieval operations
- **Reindex Controls** — manually trigger document reindexing
- **Error Monitoring** — system-level error log

---

## 11. Frequently Asked Questions

---

**Q: The AI gave an answer that seems wrong. What should I do?**

Check the **Source Citations** shown below the response. If the referenced documents do not contain relevant information, notify your Admin or Budget Analyst to upload and approve the correct documents. The AI only answers based on what is in the knowledge base.

---

**Q: My microphone button is not working for voice input.**

Ensure your browser has microphone permission enabled. In Chrome or Edge, click the padlock icon in the address bar → Site settings → Microphone → Allow. Voice input works best in **Chrome** and **Edge**.

---

**Q: Why can I not see a feature shown in this guide?**

Your role determines which features are visible. Contact your administrator if you believe you need access to a feature not currently available to you.

---

**Q: How do I know the AI's answer is accurate?**

Every AI response includes **source citations** showing exactly which documents were used and their relevance score. Higher relevance scores indicate a stronger match. If no relevant documents exist in the knowledge base, the AI will tell you.

---

**Q: A document I uploaded is still "Pending." When will it be available?**

Documents must be reviewed and approved by an **Admin** or **Budget Analyst** before the AI can use them. Contact your administrator to expedite approval.

---

**Q: How do I set up automatic report delivery?**

Go to **Reports** → find or create a report → click **Schedule** → choose a schedule. Reports run automatically at the scheduled time. Email delivery can be configured by your administrator.

---

**Q: How do I export all my reports?**

In the **Reports** panel, click **⬇ Export All** in the top-right corner to download all reports as an Excel file.

---

**Q: Can the AI see my emails?**

Only if an administrator has configured the **Email Assistant** integration. When enabled, attachments from budget-related emails are extracted and added to the knowledge base (after approval). The AI uses document text — not raw email content — to answer questions.

---

**Q: What file types can I upload?**

PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, CSV, and TXT.

---

**Q: How is my data secured?**

- All passwords are hashed (bcrypt) and never stored in plain text.
- Sessions use signed JWT tokens with configurable expiration.
- Role-based access control (RBAC) ensures users only see data appropriate to their role.
- Department Editors are scoped to their own department's documents.
- Every significant action is logged in the audit trail.

---

*For technical support, contact your system administrator.*

---

*Budget AI Assistant — User Guide v1.0*
