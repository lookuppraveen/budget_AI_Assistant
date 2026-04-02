import OpenAI from "openai";
import { pool } from "../../config/db.js";
import { env } from "../../config/env.js";

let openAiClient = null;

function getOpenAiClient() {
  if (!openAiClient) openAiClient = new OpenAI({ apiKey: env.openAiApiKey });
  return openAiClient;
}

// ── Report type definitions ────────────────────────────────────────────────
export const REPORT_TYPES = [
  "Board Summary",
  "Tax Filing Summary",
  "Department Budget Report",
  "Policy Compliance Report",
  "Fiscal Year Review",
  "Audit Trail Report",
  "Custom Report"
];

// ── Fetch approved knowledge chunks matching user filters ──────────────────
async function fetchMatchingChunks({ domain, departmentId, fiscalYear, dateFrom, dateTo }) {
  const conditions = ["kd.status = 'Approved'"];
  const params = [];

  if (domain) {
    params.push(domain);
    conditions.push(`kd.domain = $${params.length}`);
  }

  if (departmentId) {
    params.push(departmentId);
    conditions.push(`kd.department_id = $${params.length}`);
  }

  if (fiscalYear) {
    // Match FY in domain or title
    params.push(`%${fiscalYear}%`);
    conditions.push(`(kd.title ILIKE $${params.length} OR kd.domain ILIKE $${params.length})`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`kd.created_at >= $${params.length}`);
  }

  if (dateTo) {
    params.push(dateTo);
    conditions.push(`kd.created_at <= $${params.length}`);
  }

  const where = conditions.join(" AND ");

  const result = await pool.query(
    `SELECT
       kc.content,
       kc.chunk_index,
       kd.title,
       kd.domain,
       kd.source_type,
       d.name  AS department_name,
       kd.created_at
     FROM knowledge_chunks kc
     JOIN knowledge_documents kd ON kd.id = kc.document_id
     JOIN departments d           ON d.id  = kd.department_id
     WHERE ${where}
     ORDER BY kd.title ASC, kc.chunk_index ASC
     LIMIT 60`,
    params
  );

  return result.rows;
}

// ── Build system prompt based on report type ──────────────────────────────
function buildSystemPrompt(reportType, filters) {
  const dept = filters.departmentName || "All Departments";
  const domain = filters.domain || "All Domains";
  const fy = filters.fiscalYear || "All Fiscal Years";
  const notes = filters.additionalNotes ? `\nUser guidance: ${filters.additionalNotes}` : "";

  const base = `You are an expert budget reporting assistant generating a formal "${reportType}" report.
Scope: Department = ${dept} | Domain = ${domain} | Fiscal Year = ${fy}${notes}

STRICT RULES:
- Use ONLY the approved knowledge sources provided below — do not invent facts or numbers.
- Write in formal, professional English suitable for ${getAudience(reportType)}.
- Structure the report with clear sections using markdown headings (##).
- Be specific — cite document titles naturally when referencing policies or figures.
- If sources are insufficient for a section, note "Insufficient source data available."`;

  const structure = getReportStructure(reportType);
  return `${base}\n\nREQUIRED REPORT STRUCTURE:\n${structure}`;
}

function getAudience(reportType) {
  const map = {
    "Board Summary": "a board of directors or executive leadership",
    "Tax Filing Summary": "tax advisors and compliance officers",
    "Department Budget Report": "department heads and budget managers",
    "Policy Compliance Report": "compliance and audit teams",
    "Fiscal Year Review": "finance leadership and stakeholders",
    "Audit Trail Report": "internal and external auditors",
    "Custom Report": "the intended audience as specified"
  };
  return map[reportType] || "organizational leadership";
}

function getReportStructure(reportType) {
  const structures = {
    "Board Summary": `## Executive Summary
Provide a 2–3 paragraph high-level overview of the current budget posture and key decisions.

## Key Budget Highlights
Summarize the most significant policy positions, approved allocations, and strategic priorities.

## Risk & Compliance Flags
Identify any policy gaps, pending items, or compliance considerations the board should be aware of.

## Recommendations
2–4 actionable recommendations for board consideration.`,

    "Tax Filing Summary": `## Overview for Tax Purposes
Brief statement of the entity's budget and financial policy framework relevant to tax filing.

## Applicable Budget Policies
Policies and procedures directly relevant to tax treatment of funds, grants, or expenditures.

## Revenue & Fund Classification
Summary of fund types, restricted vs. unrestricted funds, and their tax implications per policy.

## Compliance Notes
Any policy provisions affecting tax-deductible expenditures, reporting deadlines, or filing requirements.

## Supporting Documentation Reference
List of source documents that should accompany the tax filing.`,

    "Department Budget Report": `## Department Overview
Brief introduction to the department's budget scope and policy framework.

## Approved Budget Policies
All approved policies governing this department's budget operations.

## Budget Procedures & Workflows
Key procedures, approval chains, and operational guidelines in effect.

## Training & Compliance Status
Training materials and compliance requirements relevant to this department.

## Recommendations
Specific guidance for department budget managers.`,

    "Policy Compliance Report": `## Compliance Summary
Overall assessment of policy coverage based on available approved documents.

## Policies in Force
Enumeration of active, approved policies found in the knowledge base.

## Coverage Gaps Identified
Areas where policy documentation is missing, outdated, or insufficient.

## High-Risk Items
Any policy provisions that indicate compliance risk or require immediate attention.

## Action Items
Prioritized list of compliance actions recommended.`,

    "Fiscal Year Review": `## Fiscal Year Overview
Summary of the fiscal year's budget framework, policies, and key decisions.

## Policy Changes & Updates
Any new or amended policies enacted during the fiscal year.

## Budget Performance Highlights
Key budget milestones, approvals, and outcomes referenced in documentation.

## Carryforward & Closure Items
Any fiscal year-end items including carryforward provisions and closure procedures.

## Looking Ahead
Recommendations and considerations for the upcoming fiscal year.`,

    "Audit Trail Report": `## Audit Scope & Objective
Purpose of this audit report and the document set reviewed.

## Document Inventory
List of all approved documents reviewed, with dates and approvers.

## Policy Adherence Findings
Assessment of whether documented policies meet internal and external standards.

## Anomalies & Observations
Any inconsistencies, gaps, or items of audit interest identified in the knowledge base.

## Auditor Recommendations
Formal recommendations for process improvement and documentation compliance.`,

    "Custom Report": `## Introduction
Context and purpose of this report as specified by the requester.

## Key Findings
Main insights drawn from the approved knowledge base based on the specified focus.

## Detailed Analysis
In-depth coverage of the requested topics, citing specific source documents.

## Summary & Conclusions
Concise summary of findings and their implications.

## Recommendations
Actionable next steps based on the analysis.`
  };

  return structures[reportType] || structures["Custom Report"];
}

// ── Generate the report via OpenAI ────────────────────────────────────────
async function generateReportContent(reportType, filters, chunks) {
  if (!env.openAiApiKey) {
    throw new Error("OpenAI API key is not configured. Cannot generate report.");
  }

  const client = getOpenAiClient();
  const systemPrompt = buildSystemPrompt(reportType, filters);

  const knowledgeContext = chunks.length
    ? chunks
        .map(
          (c, i) =>
            `[Source ${i + 1}: "${c.title}" | ${c.domain} | ${c.department_name}]\n${c.content}`
        )
        .join("\n\n---\n\n")
    : "No approved documents matched the selected filters.";

  const userPrompt = filters.additionalNotes
    ? `Generate the ${reportType} report. Additional guidance from the user: ${filters.additionalNotes}`
    : `Generate the complete ${reportType} report using the provided sources.`;

  const completion = await client.chat.completions.create({
    model: env.openAiChatModel,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${userPrompt}\n\nAPPROVED KNOWLEDGE SOURCES:\n${knowledgeContext}`
      }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  return completion.choices[0].message.content.trim();
}

// ── Format as plain text (strips markdown) ────────────────────────────────
function formatAsPlainText(content, title, reportType, filters) {
  const line = "=".repeat(70);
  const divider = "-".repeat(70);
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric"
  });

  const header = [
    line,
    title.toUpperCase(),
    `Report Type: ${reportType}`,
    `Generated: ${date}`,
    filters.departmentName ? `Department: ${filters.departmentName}` : null,
    filters.domain ? `Domain: ${filters.domain}` : null,
    filters.fiscalYear ? `Fiscal Year: ${filters.fiscalYear}` : null,
    line,
    ""
  ]
    .filter(Boolean)
    .join("\n");

  // Convert markdown headings/bold to plain text
  const body = content
    .replace(/^## (.+)$/gm, `\n${divider}\n$1\n${divider}`)
    .replace(/^### (.+)$/gm, "\n$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^- /gm, "  • ");

  const footer = [
    "",
    line,
    "DISCLAIMER: This report was generated by Budget AI Assistant using approved",
    "organizational documents. Verify all figures against authoritative financial",
    "records before submission or filing.",
    line
  ].join("\n");

  return `${header}\n${body}\n${footer}`;
}

// ── Generate DOCX-like structured text (rich plain text for .docx saving) ─
// Full docx library would require additional npm install — we produce a
// well-structured text file with .docx extension for now, which Word opens fine.
function formatAsDocx(content, title, reportType, filters) {
  // Same as plain text but with Word-friendly formatting hints
  return formatAsPlainText(content, title, reportType, filters);
}

// ── Public service functions ──────────────────────────────────────────────

export async function generateManualReport(userId, payload) {
  const {
    title,
    reportType,
    domain,
    departmentId,
    departmentName,
    fiscalYear,
    dateFrom,
    dateTo,
    additionalNotes,
    format = "txt"
  } = payload;

  // Create a pending record immediately so front-end can poll / show it
  const insertResult = await pool.query(
    `INSERT INTO manual_reports (user_id, title, report_type, filters, status, format)
     VALUES ($1, $2, $3, $4::jsonb, 'Generating', $5)
     RETURNING id`,
    [
      userId,
      title.trim(),
      reportType,
      JSON.stringify({ domain, departmentId, departmentName, fiscalYear, dateFrom, dateTo, additionalNotes }),
      format
    ]
  );

  const reportId = insertResult.rows[0].id;

  try {
    // Fetch matching knowledge chunks
    const chunks = await fetchMatchingChunks({ domain, departmentId, fiscalYear, dateFrom, dateTo });

    // Generate AI content
    const rawContent = await generateReportContent(reportType, {
      domain,
      departmentName,
      fiscalYear,
      additionalNotes
    }, chunks);

    // Format for download
    const formattedContent = format === "docx"
      ? formatAsDocx(rawContent, title, reportType, { domain, departmentName, fiscalYear })
      : formatAsPlainText(rawContent, title, reportType, { domain, departmentName, fiscalYear });

    const wordCount = rawContent.split(/\s+/).length;

    // Save the completed report
    await pool.query(
      `UPDATE manual_reports
       SET content = $1, status = 'Ready', word_count = $2, sources_used = $3
       WHERE id = $4`,
      [formattedContent, wordCount, chunks.length, reportId]
    );

    return {
      id: reportId,
      title,
      reportType,
      status: "Ready",
      content: formattedContent,
      wordCount,
      sourcesUsed: chunks.length,
      format
    };
  } catch (error) {
    await pool.query(
      `UPDATE manual_reports SET status = 'Failed', error_msg = $1 WHERE id = $2`,
      [error.message, reportId]
    );
    throw error;
  }
}

export async function listManualReports(userId, userRole) {
  // Admins and Budget Analysts see all reports; others see only their own
  const isAdmin = userRole === "Admin" || userRole === "Budget Analyst";

  const result = isAdmin
    ? await pool.query(
        `SELECT mr.id, mr.title, mr.report_type, mr.status, mr.format,
                mr.word_count, mr.sources_used, mr.created_at,
                u.name AS generated_by
         FROM manual_reports mr
         JOIN users u ON u.id = mr.user_id
         ORDER BY mr.created_at DESC
         LIMIT 100`
      )
    : await pool.query(
        `SELECT mr.id, mr.title, mr.report_type, mr.status, mr.format,
                mr.word_count, mr.sources_used, mr.created_at,
                u.name AS generated_by
         FROM manual_reports mr
         JOIN users u ON u.id = mr.user_id
         WHERE mr.user_id = $1
         ORDER BY mr.created_at DESC
         LIMIT 100`,
        [userId]
      );

  return result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    reportType: r.report_type,
    status: r.status,
    format: r.format,
    wordCount: r.word_count,
    sourcesUsed: r.sources_used,
    createdAt: r.created_at,
    generatedBy: r.generated_by
  }));
}

export async function getManualReportContent(reportId, userId, userRole) {
  const isAdmin = userRole === "Admin" || userRole === "Budget Analyst";

  const result = isAdmin
    ? await pool.query(
        `SELECT id, user_id, title, report_type, filters, content, status,
                format, word_count, sources_used, error_msg, created_at
         FROM manual_reports WHERE id = $1`,
        [reportId]
      )
    : await pool.query(
        `SELECT id, user_id, title, report_type, filters, content, status,
                format, word_count, sources_used, error_msg, created_at
         FROM manual_reports WHERE id = $1 AND user_id = $2`,
        [reportId, userId]
      );

  if (result.rowCount === 0) {
    const err = new Error("Report not found");
    err.statusCode = 404;
    throw err;
  }

  const r = result.rows[0];
  return {
    id: r.id,
    title: r.title,
    reportType: r.report_type,
    filters: r.filters,
    content: r.content,
    status: r.status,
    format: r.format,
    wordCount: r.word_count,
    sourcesUsed: r.sources_used,
    errorMsg: r.error_msg,
    createdAt: r.created_at
  };
}

export async function deleteManualReport(reportId, userId, userRole) {
  const isAdmin = userRole === "Admin";

  const result = isAdmin
    ? await pool.query("DELETE FROM manual_reports WHERE id = $1 RETURNING id", [reportId])
    : await pool.query(
        "DELETE FROM manual_reports WHERE id = $1 AND user_id = $2 RETURNING id",
        [reportId, userId]
      );

  if (result.rowCount === 0) {
    const err = new Error("Report not found or not authorized to delete");
    err.statusCode = 404;
    throw err;
  }
}
