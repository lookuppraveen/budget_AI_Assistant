import { pool } from "../../config/db.js";

const SECRET_MASK = "••••••••";

function maskRow(row) {
  if (!row) return null;
  return { ...row, client_secret: row.client_secret ? SECRET_MASK : "" };
}

export async function getSharePointConfig() {
  const result = await pool.query(
    `SELECT id, tenant_id, client_id, client_secret, site_url, library_path, domain,
            status, last_synced_at, synced_files
     FROM sharepoint_integrations
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  return result.rowCount ? maskRow(result.rows[0]) : null;
}

async function getM365Token(tenantId, clientId, clientSecret) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default"
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw Object.assign(
      new Error(`M365 authentication failed: ${err.error_description || err.error || "unknown error"}`),
      { statusCode: 401 }
    );
  }

  const data = await response.json();
  return data.access_token;
}

function parseSiteUrlParts(siteUrl) {
  const url = new URL(siteUrl);
  const hostname = url.hostname;
  const sitePath = url.pathname.replace(/^\//, "");
  return { hostname, sitePath };
}

async function getSiteId(accessToken, siteUrl) {
  const { hostname, sitePath } = parseSiteUrlParts(siteUrl);
  const url = `https://graph.microsoft.com/v1.0/sites/${hostname}:/${sitePath}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`Cannot access SharePoint site. Verify the site URL and that Sites.Read.All permission is granted.`),
      { statusCode: 403 }
    );
  }

  const data = await response.json();
  return data.id;
}

async function getDefaultDriveId(accessToken, siteId) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drives`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw Object.assign(new Error("Cannot list SharePoint drives."), { statusCode: 502 });
  }

  const data = await response.json();
  const drive = data.value?.[0];
  if (!drive) {
    throw Object.assign(new Error("No document library found in SharePoint site."), { statusCode: 404 });
  }

  return drive.id;
}

async function listLibraryFiles(accessToken, driveId, libraryPath) {
  const encodedPath = libraryPath.replace(/^\/+/, "");
  const url = encodedPath
    ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodedPath}:/children`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw Object.assign(new Error(`Cannot list files in library path "${libraryPath}".`), { statusCode: 404 });
  }

  const data = await response.json();
  return data.value || [];
}

async function upsertSharePointRow(config, status) {
  const existing = await pool.query("SELECT id FROM sharepoint_integrations LIMIT 1");

  if (existing.rowCount) {
    await pool.query(
      `UPDATE sharepoint_integrations
       SET tenant_id = $1, client_id = $2, client_secret = $3,
           site_url = $4, library_path = $5, domain = $6,
           status = $7, updated_at = now()
       WHERE id = $8`,
      [
        config.tenantId,
        config.clientId,
        config.clientSecret,
        config.siteUrl,
        config.libraryPath,
        config.domain,
        status,
        existing.rows[0].id
      ]
    );
    return;
  }

  await pool.query(
    `INSERT INTO sharepoint_integrations
       (tenant_id, client_id, client_secret, site_url, library_path, domain, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [config.tenantId, config.clientId, config.clientSecret, config.siteUrl, config.libraryPath, config.domain, status]
  );
}

export async function testAndSaveSharePointConfig(config) {
  let accessToken;

  try {
    accessToken = await getM365Token(config.tenantId, config.clientId, config.clientSecret);
  } catch (error) {
    await upsertSharePointRow(config, "disconnected");
    return { connected: false, message: error.message };
  }

  try {
    const siteId = await getSiteId(accessToken, config.siteUrl);
    await getDefaultDriveId(accessToken, siteId);
  } catch (error) {
    await upsertSharePointRow(config, "disconnected");
    return { connected: false, message: error.message };
  }

  await upsertSharePointRow(config, "connected");
  return { connected: true, message: `Connected to SharePoint site successfully.` };
}

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".csv", ".txt"]);

function isSupportedFile(name) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export async function syncSharePoint() {
  const existing = await pool.query(
    `SELECT tenant_id, client_id, client_secret, site_url, library_path, domain, status
     FROM sharepoint_integrations
     ORDER BY updated_at DESC
     LIMIT 1`
  );

  if (!existing.rowCount || existing.rows[0].status !== "connected") {
    const error = new Error(
      "No connected SharePoint integration found. Test and save your configuration first."
    );
    error.statusCode = 400;
    throw error;
  }

  const row = existing.rows[0];
  const accessToken = await getM365Token(row.tenant_id, row.client_id, row.client_secret);
  const siteId = await getSiteId(accessToken, row.site_url);
  const driveId = await getDefaultDriveId(accessToken, siteId);
  const files = await listLibraryFiles(accessToken, driveId, row.library_path);

  const supportedFiles = files.filter((file) => !file.folder && isSupportedFile(file.name || ""));
  let newDocuments = 0;

  for (const file of supportedFiles) {
    const existing = await pool.query(
      `SELECT id FROM knowledge_documents
       WHERE source_type = 'SharePoint'
         AND metadata->>'sharePointId' = $1
       LIMIT 1`,
      [file.id]
    );

    if (existing.rowCount) {
      continue;
    }

    const deptResult = await pool.query(
      "SELECT id FROM departments ORDER BY id ASC LIMIT 1"
    );

    if (!deptResult.rowCount) {
      continue;
    }

    const submitterResult = await pool.query(
      "SELECT id FROM users ORDER BY created_at ASC LIMIT 1"
    );

    if (!submitterResult.rowCount) {
      continue;
    }

    await pool.query(
      `INSERT INTO knowledge_documents
         (title, source_type, domain, department_id, submitted_by, metadata)
       VALUES ($1, 'SharePoint', $2, $3, $4, $5::jsonb)`,
      [
        file.name,
        row.domain,
        deptResult.rows[0].id,
        submitterResult.rows[0].id,
        JSON.stringify({
          sharePointId: file.id,
          webUrl: file.webUrl,
          size: file.size,
          lastModified: file.lastModifiedDateTime
        })
      ]
    );

    newDocuments += 1;
  }

  await pool.query(
    `UPDATE sharepoint_integrations
     SET synced_files = $1, last_synced_at = now(), updated_at = now()
     WHERE id = (SELECT id FROM sharepoint_integrations LIMIT 1)`,
    [supportedFiles.length]
  );

  return { totalFiles: supportedFiles.length, newDocuments };
}
