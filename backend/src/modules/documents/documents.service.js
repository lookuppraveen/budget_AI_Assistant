import { pool } from "../../config/db.js";
import { extractText } from "../../utils/extract-text.js";
import { indexApprovedDocumentChunks } from "../retrieval/retrieval.service.js";

export async function listDocuments({ departmentCode, status, departmentId } = {}) {
  const filters = [];
  const values = [];

  // departmentId scoping takes priority over departmentCode filter
  if (departmentId) {
    values.push(departmentId);
    filters.push(`kd.department_id = $${values.length}`);
  } else if (departmentCode) {
    values.push(departmentCode);
    filters.push(`upper(d.code) = upper($${values.length})`);
  }

  if (status) {
    values.push(status);
    filters.push(`kd.status = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const result = await pool.query(
    `SELECT kd.id, kd.title, kd.source_type, kd.domain, kd.status, kd.review_note,
            kd.created_at, kd.updated_at, kd.reviewed_at,
            d.name AS department, d.code AS department_code,
            su.id AS submitted_by_id, su.name AS submitted_by_name,
            ru.id AS reviewed_by_id, ru.name AS reviewed_by_name,
            kd.metadata
     FROM knowledge_documents kd
     JOIN departments d ON d.id = kd.department_id
     JOIN users su ON su.id = kd.submitted_by
     LEFT JOIN users ru ON ru.id = kd.reviewed_by
     ${whereClause}
     ORDER BY kd.created_at DESC`,
    values
  );

  return result.rows;
}

export async function createDocument({ title, sourceType, domain, departmentCode, metadata, rawText }, currentUserId) {
  const department = await pool.query("SELECT id FROM departments WHERE upper(code) = upper($1)", [departmentCode]);

  if (department.rowCount === 0) {
    const error = new Error("Invalid department code");
    error.statusCode = 400;
    throw error;
  }

  const cleanText = rawText?.trim() || null;

  const result = await pool.query(
    `INSERT INTO knowledge_documents (title, source_type, domain, department_id, submitted_by, metadata, raw_text)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     RETURNING id, title, source_type, domain, status, created_at`,
    [title.trim(), sourceType, domain.trim(), department.rows[0].id, currentUserId, JSON.stringify(metadata || {}), cleanText]
  );

  await indexApprovedDocumentChunks(result.rows[0].id);

  return result.rows[0];
}

export async function uploadDocuments({ files, domain, departmentCode }, currentUserId) {
  const department = await pool.query("SELECT id FROM departments WHERE upper(code) = upper($1)", [departmentCode]);

  if (department.rowCount === 0) {
    const error = new Error("Invalid department code");
    error.statusCode = 400;
    throw error;
  }

  const departmentId = department.rows[0].id;
  const results = [];

  for (const file of files) {
    const title = file.originalname.trim();
    const rawText = await extractText(file.buffer, file.mimetype);

    const metadata = {
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      extractedChars: rawText.length
    };

    // Upsert — overwrite if same filename already exists in this department
    const existing = await pool.query(
      `SELECT id FROM knowledge_documents WHERE title = $1 AND department_id = $2`,
      [title, departmentId]
    );

    let document;

    if (existing.rowCount > 0) {
      const updated = await pool.query(
        `UPDATE knowledge_documents
         SET domain = $1, submitted_by = $2, metadata = $3::jsonb, raw_text = $4,
             status = 'Pending', review_note = NULL, reviewed_by = NULL,
             reviewed_at = NULL, updated_at = now()
         WHERE id = $5
         RETURNING id, title, source_type, domain, status, created_at`,
        [domain.trim(), currentUserId, JSON.stringify(metadata), rawText || null, existing.rows[0].id]
      );
      document = updated.rows[0];
    } else {
      const inserted = await pool.query(
        `INSERT INTO knowledge_documents (title, source_type, domain, department_id, submitted_by, metadata, raw_text)
         VALUES ($1, 'Upload', $2, $3, $4, $5::jsonb, $6)
         RETURNING id, title, source_type, domain, status, created_at`,
        [title, domain.trim(), departmentId, currentUserId, JSON.stringify(metadata), rawText || null]
      );
      document = inserted.rows[0];
    }

    await indexApprovedDocumentChunks(document.id);
    results.push({ ...document, originalName: file.originalname, extractedChars: rawText.length });
  }

  return results;
}

/** Returns true if the URL is a SharePoint or OneDrive sharing link */
function isSharePointUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".sharepoint.com") || host.endsWith(".onedrive.com") || host === "onedrive.live.com";
  } catch {
    return false;
  }
}

/**
 * Encodes a sharing URL into the Graph API shares token format.
 * Graph API spec: https://learn.microsoft.com/en-us/graph/api/shares-get
 */
function encodeSharesToken(sharingUrl) {
  const b64 = Buffer.from(sharingUrl).toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `u!${b64}`;
}

/**
 * Fetches a SharePoint/OneDrive sharing link via Microsoft Graph API.
 * Reads stored SharePoint credentials from sharepoint_integrations.
 * Returns { buffer, contentType, fileName }
 */
async function fetchSharePointFile(sharingUrl) {
  const spRow = await pool.query(
    `SELECT tenant_id, client_id, client_secret FROM sharepoint_integrations
     WHERE status = 'connected' ORDER BY updated_at DESC LIMIT 1`
  );

  if (!spRow.rowCount) {
    throw Object.assign(
      new Error(
        "SharePoint URL detected but no connected SharePoint integration found. " +
        "Go to Knowledge Ingestion → SharePoint Repo, configure your Azure app credentials, and click 'Test & Save Connection' first."
      ),
      { statusCode: 422 }
    );
  }

  const { tenant_id, client_id, client_secret } = spRow.rows[0];

  // Get an app-only access token
  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id,
    client_secret,
    scope: "https://graph.microsoft.com/.default"
  });

  const tokenResp = await fetch(
    `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tokenBody }
  );

  if (!tokenResp.ok) {
    const err = await tokenResp.json().catch(() => ({}));
    throw Object.assign(
      new Error(`SharePoint authentication failed: ${err.error_description || err.error || "unknown"}`),
      { statusCode: 502 }
    );
  }

  const { access_token } = await tokenResp.json();
  const sharesToken = encodeSharesToken(sharingUrl);

  // First resolve the driveItem metadata to get name + MIME type
  const metaResp = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${sharesToken}/driveItem`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  if (!metaResp.ok) {
    const err = await metaResp.json().catch(() => ({}));
    throw Object.assign(
      new Error(
        `Cannot access this SharePoint file via Graph API: ${err.error?.message || metaResp.statusText}. ` +
        "Ensure your Azure app has Files.Read.All permission and the file is accessible to the app."
      ),
      { statusCode: 422 }
    );
  }

  const meta = await metaResp.json();
  const fileName = meta.name || "sharepoint-file";
  const mimeType = meta.file?.mimeType || "application/octet-stream";

  // Now download the actual file content
  const contentResp = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${sharesToken}/driveItem/content`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  if (!contentResp.ok) {
    throw Object.assign(
      new Error(`Failed to download SharePoint file content: ${contentResp.statusText}`),
      { statusCode: 502 }
    );
  }

  const arrayBuffer = await contentResp.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType: mimeType, fileName };
}

export async function ingestUrl({ url, domain, departmentCode, title }, currentUserId) {
  const department = await pool.query("SELECT id FROM departments WHERE upper(code) = upper($1)", [departmentCode]);

  if (department.rowCount === 0) {
    const error = new Error("Invalid department code");
    error.statusCode = 400;
    throw error;
  }

  let responseBuffer;
  let contentType = "text/html";
  let resolvedFileName = null;

  if (isSharePointUrl(url)) {
    // Route SharePoint/OneDrive links through Graph API
    const result = await fetchSharePointFile(url);
    responseBuffer = result.buffer;
    contentType = result.contentType;
    resolvedFileName = result.fileName;
  } else {
    // Regular public URL fetch (10 s timeout)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "BudgetAI-Ingestor/1.0" }
      });

      if (!response.ok) {
        const error = new Error(`URL fetch failed: ${response.status} ${response.statusText}`);
        error.statusCode = 422;
        throw error;
      }

      contentType = (response.headers.get("content-type") || "text/html").split(";")[0].trim().toLowerCase();
      const arrayBuffer = await response.arrayBuffer();
      responseBuffer = Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeout);
    }
  }

  // Try extraction for known file types; strip HTML for web pages
  let rawText = "";

  const FILE_MIME_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/csv",
    "text/plain"
  ]);

  if (FILE_MIME_TYPES.has(contentType)) {
    rawText = await extractText(responseBuffer, contentType);
  } else {
    // HTML — strip tags to get readable text
    const html = responseBuffer.toString("utf8");
    rawText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  const documentTitle = (title?.trim() || resolvedFileName || url).slice(0, 300);

  const metadata = {
    sourceUrl: url,
    contentType,
    fetchedAt: new Date().toISOString(),
    extractedChars: rawText.length
  };

  const result = await pool.query(
    `INSERT INTO knowledge_documents (title, source_type, domain, department_id, submitted_by, metadata, raw_text)
     VALUES ($1, 'PublicLink', $2, $3, $4, $5::jsonb, $6)
     RETURNING id, title, source_type, domain, status, created_at`,
    [documentTitle, domain.trim(), department.rows[0].id, currentUserId, JSON.stringify(metadata), rawText || null]
  );

  const document = result.rows[0];
  await indexApprovedDocumentChunks(document.id);

  return { ...document, extractedChars: rawText.length };
}

export async function getDocumentDownloadUrl(documentId) {
  const result = await pool.query(
    `SELECT id, title, metadata FROM knowledge_documents WHERE id = $1`,
    [documentId]
  );

  if (result.rowCount === 0) {
    throw Object.assign(new Error("Document not found"), { statusCode: 404 });
  }

  // Files are stored as extracted text in the DB — no binary download available
  throw Object.assign(
    new Error("Binary file download is not available. Documents are stored as extracted text only."),
    { statusCode: 422 }
  );
}

export async function reuploadDocument(documentId, file) {
  const rawText = await extractText(file.buffer, file.mimetype);

  const metadata = {
    originalName: file.originalname,
    mimeType: file.mimetype,
    fileSize: file.size,
    extractedChars: rawText.length,
    reuploadedAt: new Date().toISOString()
  };

  const result = await pool.query(
    `UPDATE knowledge_documents
     SET raw_text = $1, metadata = $2::jsonb, updated_at = now()
     WHERE id = $3
     RETURNING id, title, status`,
    [rawText || null, JSON.stringify(metadata), documentId]
  );

  if (result.rowCount === 0) {
    throw Object.assign(new Error("Document not found"), { statusCode: 404 });
  }

  await indexApprovedDocumentChunks(documentId);

  return { ...result.rows[0], extractedChars: rawText.length };
}

export async function deleteDocument(documentId) {
  const result = await pool.query(
    `DELETE FROM knowledge_documents WHERE id = $1 RETURNING id, title`,
    [documentId]
  );

  if (result.rowCount === 0) {
    throw Object.assign(new Error("Document not found"), { statusCode: 404 });
  }

  return result.rows[0];
}

export async function updateDocumentStatus(documentId, { status, reviewNote }, reviewerId) {
  const result = await pool.query(
    `UPDATE knowledge_documents
     SET status = $1,
         review_note = $2,
         reviewed_by = $3,
         reviewed_at = now(),
         updated_at = now()
     WHERE id = $4
     RETURNING id, title, status, review_note, reviewed_at`,
    [status, reviewNote || null, reviewerId, documentId]
  );

  if (result.rowCount === 0) {
    const error = new Error("Document not found");
    error.statusCode = 404;
    throw error;
  }

  await indexApprovedDocumentChunks(documentId);

  return result.rows[0];
}
