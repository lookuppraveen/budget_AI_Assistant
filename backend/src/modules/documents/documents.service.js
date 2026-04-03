import { randomUUID } from "crypto";
import path from "path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { pool } from "../../config/db.js";
import { s3Client } from "../../config/s3.js";
import { env } from "../../config/env.js";
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
  try {
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
      const ext = path.extname(file.originalname).toLowerCase();
      const s3Key = `documents/${departmentCode.toUpperCase()}/${randomUUID()}${ext}`;

      // Extract text from buffer before uploading so we have it for indexing
      const rawText = await extractText(file.buffer, file.mimetype);
      console.log("sxec", s3Client);
      await s3Client.send(
        new PutObjectCommand({
          Bucket: env.awsBucket,
          Key: s3Key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ContentLength: file.size
        })
      );

      const s3Url = `https://${env.awsBucket}.s3.${env.awsRegion}.amazonaws.com/${s3Key}`;

      const metadata = {
        s3Key,
        s3Url,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        extractedChars: rawText.length
      };

      // Check if a document with the same title already exists in this department
      const existing = await pool.query(
        `SELECT id FROM knowledge_documents WHERE title = $1 AND department_id = $2`,
        [title, departmentId]
      );

      let document;

      if (existing.rowCount > 0) {
        // Overwrite — delete old chunks then update the record
        const existingId = existing.rows[0].id;
        await pool.query(`DELETE FROM knowledge_chunks WHERE document_id = $1`, [existingId]);
        const updated = await pool.query(
          `UPDATE knowledge_documents
         SET domain = $1, submitted_by = $2, metadata = $3::jsonb, raw_text = $4,
             status = 'Pending', review_note = NULL, reviewed_by = NULL,
             reviewed_at = NULL, updated_at = now()
         WHERE id = $5
         RETURNING id, title, source_type, domain, status, created_at`,
          [domain.trim(), currentUserId, JSON.stringify(metadata), rawText || null, existingId]
        );
        document = updated.rows[0];
      } else {
        // New document
        const inserted = await pool.query(
          `INSERT INTO knowledge_documents (title, source_type, domain, department_id, submitted_by, metadata, raw_text)
         VALUES ($1, 'Upload', $2, $3, $4, $5::jsonb, $6)
         RETURNING id, title, source_type, domain, status, created_at`,
          [title, domain.trim(), departmentId, currentUserId, JSON.stringify(metadata), rawText || null]
        );
        document = inserted.rows[0];
      }

      await indexApprovedDocumentChunks(document.id);

      results.push({ ...document, s3Key, s3Url, originalName: file.originalname, extractedChars: rawText.length });
    }

    return results;
  } catch (error) {
    console.error("Error uploading documents:", error);
    throw error;
  }
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
    `SELECT id, title, source_type, metadata FROM knowledge_documents WHERE id = $1`,
    [documentId]
  );

  if (result.rowCount === 0) {
    throw Object.assign(new Error("Document not found"), { statusCode: 404 });
  }

  const doc = result.rows[0];
  const s3Key = doc.metadata?.s3Key;

  if (!s3Key) {
    throw Object.assign(
      new Error("This document has no file stored — it was ingested from a URL or email and has no binary download."),
      { statusCode: 422 }
    );
  }

  if (!env.awsBucket) {
    throw Object.assign(new Error("S3 is not configured on this server."), { statusCode: 503 });
  }

  const command = new GetObjectCommand({
    Bucket: env.awsBucket,
    Key: s3Key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(doc.metadata.originalName || doc.title)}"`
  });

  // Pre-signed URL valid for 15 minutes
  const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });

  return {
    url,
    filename: doc.metadata.originalName || doc.title,
    mimeType: doc.metadata.mimeType || "application/octet-stream",
    expiresInSeconds: 900
  };
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
