import { useEffect, useMemo, useState } from "react";
import { useMasterData } from "../../hooks/useMasterData.js";
import { getSharePointConfig, syncSharePoint, testSharePointConnection } from "../../services/sharepointApi.js";
import { getDepartments, reindexDocumentChunks } from "../../services/adminApi.js";
import { deleteDocument, downloadDocument, getDocuments, ingestDocumentUrl, reuploadDocument, searchKnowledge, uploadDocumentFiles } from "../../services/documentsApi.js";

const allowedFileTypes = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt";

const tabs = [
  { id: "upload", label: "Upload Documents" },
  { id: "sharepoint", label: "SharePoint Repo" },
  { id: "links", label: "Public Links" },
  { id: "coverage", label: "Domain Coverage" },
  { id: "queue", label: "Ingestion Queue" },
  { id: "search", label: "Search Knowledge" }
];

export default function KnowledgePanel({ domains: domainsFallback, authToken }) {
  const { values: domains } = useMasterData(authToken, "Knowledge Domain", domainsFallback);

  const [activeTab, setActiveTab] = useState("upload");
  const [uploadedItems, setUploadedItems] = useState([]);
  const [publicLink, setPublicLink] = useState("");

  // Department list for upload
  const [departments, setDepartments] = useState([]);
  const [uploadDeptCode, setUploadDeptCode] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // SharePoint fields
  const [spTenantId, setSpTenantId] = useState("");
  const [spClientId, setSpClientId] = useState("");
  const [spClientSecret, setSpClientSecret] = useState("");
  const [spSiteUrl, setSpSiteUrl] = useState("");
  const [spLibrary, setSpLibrary] = useState("");
  const [spDomain, setSpDomain] = useState(domains[0] || "");
  const [sharePointStatus, setSharePointStatus] = useState("Not connected");
  const [spStatusOk, setSpStatusOk] = useState(false);
  const [spTesting, setSpTesting] = useState(false);
  const [spSyncing, setSpSyncing] = useState(false);
  const [spSyncResult, setSpSyncResult] = useState(null);

  const [uploadDomain, setUploadDomain] = useState(domains[0] || "");
  const [linkDomain, setLinkDomain] = useState(domains[0] || "");
  const [linkDeptCode, setLinkDeptCode] = useState("");
  const [ingestingLink, setIngestingLink] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linkSuccess, setLinkSuccess] = useState("");

  // Knowledge search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDomain, setSearchDomain] = useState("");
  const [searchDept, setSearchDept] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Queue submit state — keyed by item.id
  const [submittingIds, setSubmittingIds] = useState(new Set());
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [reuploadingIds, setReuploadingIds] = useState(new Set());
  const [submitAllBusy, setSubmitAllBusy] = useState(false);
  const [queueMessage, setQueueMessage] = useState("");

  useEffect(() => {
    if (!authToken) return;

    getDepartments(authToken)
      .then(({ departments: list }) => {
        setDepartments(list || []);
        if (list && list.length > 0) {
          setUploadDeptCode(list[0].code);
          setLinkDeptCode(list[0].code);
        }
      })
      .catch(() => {});
  }, [authToken]);

  // Load existing documents from DB so the queue is populated after login
  useEffect(() => {
    if (!authToken) return;

    getDocuments(authToken)
      .then(({ documents }) => {
        if (!documents || documents.length === 0) return;
        const dbItems = documents.map((doc) => {
          // metadata is a plain object from the DB row
          const meta = doc.metadata || {};
          const sizeLabel = meta.fileSize
            ? `${Math.max(1, Math.round(meta.fileSize / 1024))} KB`
            : meta.extractedChars
            ? `${meta.extractedChars.toLocaleString()} chars`
            : doc.source_type;
          const uiStatus = doc.status === "Rejected" ? "error"
            : doc.status === "Approved" ? "done"
            : ""; // Pending / Hold → "Queued" label in UI
          return {
            id: doc.id,
            documentId: doc.id,
            name: doc.title,
            size: sizeLabel,
            source: doc.source_type,
            domain: doc.domain,
            status: uiStatus
          };
        });
        setUploadedItems(dbItems);
      })
      .catch(() => {});
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;

    getSharePointConfig(authToken)
      .then(({ config }) => {
        if (!config) return;
        setSpTenantId(config.tenant_id || "");
        setSpClientId(config.client_id || "");
        setSpSiteUrl(config.site_url || "");
        setSpLibrary(config.library_path || "");
        if (config.domain && domains.includes(config.domain)) {
          setSpDomain(config.domain);
        }
        setSpStatusOk(config.status === "connected");
        setSharePointStatus(
          config.status === "connected"
            ? `Connected — ${config.synced_files || 0} files synced`
            : "Not connected"
        );
        // client_secret is masked — user must re-enter to re-test
      })
      .catch(() => {});
  }, [authToken, domains]);

  const domainStats = useMemo(() => {
    const counts = Object.fromEntries(domains.map((domain) => [domain, 0]));
    uploadedItems.forEach((item) => {
      if (counts[item.domain] !== undefined) counts[item.domain] += 1;
    });
    return counts;
  }, [domains, uploadedItems]);

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    if (!uploadDeptCode) {
      setUploadError("Select a department before uploading.");
      return;
    }

    setUploadError("");
    setUploading(true);

    // Add entries with "uploading" status immediately so user sees feedback
    const pendingEntries = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      source: "Local Upload",
      domain: uploadDomain,
      status: "uploading"
    }));

    setUploadedItems((previous) => [...pendingEntries, ...previous]);
    setActiveTab("queue");

    try {
      const result = await uploadDocumentFiles({
        token: authToken,
        files,
        domain: uploadDomain,
        departmentCode: uploadDeptCode
      });

      const uploadedIds = new Set(pendingEntries.map((e) => e.id));
      const serverDocs = result.documents || [];

      setUploadedItems((previous) =>
        previous.map((item) => {
          if (!uploadedIds.has(item.id)) return item;
          const matched = serverDocs.find((d) => d.originalName === item.name);
          return { ...item, status: matched ? "done" : "done", documentId: matched?.id };
        })
      );
    } catch (error) {
      const uploadedIds = new Set(pendingEntries.map((e) => e.id));
      setUploadedItems((previous) =>
        previous.map((item) =>
          uploadedIds.has(item.id) ? { ...item, status: "error" } : item
        )
      );
      setUploadError(error.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const addPublicLink = async () => {
    const value = publicLink.trim();
    if (!value) return;

    if (!linkDeptCode) {
      setLinkError("Select a department before adding a link.");
      return;
    }

    setLinkError("");
    setLinkSuccess("");
    setIngestingLink(true);

    const itemId = `${value}-${Date.now()}`;
    setUploadedItems((previous) => [
      {
        id: itemId,
        name: value,
        size: "Public URL",
        source: "Public URL",
        domain: linkDomain,
        status: "uploading"
      },
      ...previous
    ]);
    setPublicLink("");
    setActiveTab("queue");

    try {
      const result = await ingestDocumentUrl({
        token: authToken,
        url: value,
        domain: linkDomain,
        departmentCode: linkDeptCode
      });

      setUploadedItems((previous) =>
        previous.map((item) =>
          item.id === itemId
            ? { ...item, status: "done", documentId: result.document?.id }
            : item
        )
      );
      setLinkSuccess(`Ingested — ${result.document?.extractedChars?.toLocaleString() || 0} characters extracted.`);
    } catch (error) {
      setUploadedItems((previous) =>
        previous.map((item) => (item.id === itemId ? { ...item, status: "error" } : item))
      );
      setLinkError(error.message || "URL ingestion failed.");
    } finally {
      setIngestingLink(false);
    }
  };

  const handleSharePointTest = async () => {
    if (!authToken) return;

    if (!spTenantId.trim() || !spClientId.trim() || !spClientSecret.trim() || !spSiteUrl.trim() || !spLibrary.trim()) {
      setSharePointStatus("All fields are required to test connection.");
      setSpStatusOk(false);
      return;
    }

    setSpTesting(true);
    setSpStatusOk(false);
    setSharePointStatus("Testing connection...");

    try {
      const result = await testSharePointConnection(authToken, {
        tenantId: spTenantId,
        clientId: spClientId,
        clientSecret: spClientSecret,
        siteUrl: spSiteUrl,
        libraryPath: spLibrary,
        domain: spDomain
      });

      setSpStatusOk(result.connected);
      setSharePointStatus(result.message);
    } catch (error) {
      setSpStatusOk(false);
      setSharePointStatus(`Error: ${error.message || "Connection test failed"}`);
    } finally {
      setSpTesting(false);
    }
  };

  const handleSharePointSync = async () => {
    if (!authToken || !spStatusOk) return;

    setSpSyncing(true);
    setSpSyncResult(null);

    try {
      const result = await syncSharePoint(authToken);
      setSpSyncResult(result);
      setSharePointStatus(`Sync complete — ${result.totalFiles} files found, ${result.newDocuments} new documents added.`);

      if (result.newDocuments > 0) {
        setUploadedItems((previous) => [
          {
            id: `sp-sync-${Date.now()}`,
            name: `SharePoint sync (${result.newDocuments} new docs)`,
            size: "Remote Sync",
            source: "SharePoint",
            domain: spDomain
          },
          ...previous
        ]);
        setActiveTab("queue");
      }
    } catch (error) {
      setSharePointStatus(`Sync failed: ${error.message}`);
    } finally {
      setSpSyncing(false);
    }
  };

  const updateItemDomain = (itemId, domain) => {
    setUploadedItems((previous) => previous.map((item) => (item.id === itemId ? { ...item, domain } : item)));
  };

  const handleSubmitItem = async (item) => {
    if (!item.documentId) {
      setQueueMessage("This item has no server document ID — it may have failed to upload.");
      return;
    }

    setQueueMessage("");
    setSubmittingIds((prev) => new Set([...prev, item.id]));

    try {
      await reindexDocumentChunks(authToken, item.documentId);
      setUploadedItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i))
      );
      setQueueMessage(`Re-indexed: ${item.name}`);
    } catch (err) {
      setUploadedItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "error" } : i))
      );
      setQueueMessage(`Re-index failed for ${item.name}: ${err.message}`);
    } finally {
      setSubmittingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}" permanently? This cannot be undone.`)) return;

    // No server document yet — just remove from UI
    if (!item.documentId) {
      setUploadedItems((prev) => prev.filter((i) => i.id !== item.id));
      return;
    }

    setDeletingIds((prev) => new Set([...prev, item.id]));
    setQueueMessage("");

    try {
      await deleteDocument(authToken, item.documentId);
      setUploadedItems((prev) => prev.filter((i) => i.id !== item.id));
      setQueueMessage(`Deleted: ${item.name}`);
    } catch (err) {
      setQueueMessage(`Delete failed for ${item.name}: ${err.message}`);
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  };

  const handleReupload = async (item, file) => {
    if (!item.documentId || !file) return;

    setReuploadingIds((prev) => new Set([...prev, item.id]));
    setQueueMessage("");

    try {
      const result = await reuploadDocument({ token: authToken, documentId: item.documentId, file });
      const chars = result.document?.extractedChars || 0;
      setUploadedItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "done", size: `${chars.toLocaleString()} chars` } : i))
      );
      setQueueMessage(`Re-uploaded: ${item.name} — ${chars.toLocaleString()} chars extracted`);
    } catch (err) {
      setQueueMessage(`Re-upload failed for ${item.name}: ${err.message}`);
    } finally {
      setReuploadingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  };

  const handleDownload = async (item) => {
    if (!item.documentId) return;
    try {
      const result = await downloadDocument(authToken, item.documentId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setQueueMessage(`Download failed: ${err.message}`);
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchError("");
    setSearchLoading(true);
    try {
      const { results } = await searchKnowledge(authToken, q, {
        domain: searchDomain || undefined,
        department: searchDept || undefined,
        limit: 10
      });
      setSearchResults(results || []);
    } catch (err) {
      setSearchError(err.message || "Search failed.");
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSubmitAll = async () => {
    const eligible = uploadedItems.filter((i) => i.documentId && i.status !== "uploading");
    if (eligible.length === 0) {
      setQueueMessage("No items with a server document ID to re-index.");
      return;
    }

    setSubmitAllBusy(true);
    setQueueMessage("");
    let succeeded = 0;
    let failed = 0;

    for (const item of eligible) {
      setSubmittingIds((prev) => new Set([...prev, item.id]));
      try {
        await reindexDocumentChunks(authToken, item.documentId);
        setUploadedItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i))
        );
        succeeded++;
      } catch {
        failed++;
      } finally {
        setSubmittingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
      }
    }

    setQueueMessage(`Submit All complete — ${succeeded} re-indexed${failed > 0 ? `, ${failed} failed` : ""}.`);
    setSubmitAllBusy(false);
  };

  return (
    <article className="panel active">
      <div className="panel-head">
        <h2>Knowledge Ingestion</h2>
        <p>Every source is mapped to a domain so backend training/indexing can stay domain-aligned.</p>
      </div>

      <div className="knowledge-tabs" role="tablist" aria-label="Knowledge ingestion sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "upload" && (
        <section className="setup-card tab-content">
          <h3>Upload Documents with Domain Mapping</h3>
          <p className="section-caption">Accepted types: PDF, Word, Excel, PowerPoint, CSV, TXT &mdash; max 50 MB per file, up to 10 files at once</p>
          <div className="config-grid two-col">
            <label className="field">
              <span>Domain for this upload batch</span>
              <select value={uploadDomain} onChange={(event) => setUploadDomain(event.target.value)}>
                {domains.map((domain) => (
                  <option key={domain} value={domain}>{domain}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Department</span>
              <select value={uploadDeptCode} onChange={(event) => setUploadDeptCode(event.target.value)} disabled={departments.length === 0}>
                {departments.length === 0
                  ? <option value="">Loading departments...</option>
                  : departments.map((dept) => (
                    <option key={dept.code} value={dept.code}>{dept.name} ({dept.code})</option>
                  ))
                }
              </select>
            </label>
          </div>
          <label className={`upload-box ${uploading ? "disabled" : ""}`}>
            <input type="file" multiple accept={allowedFileTypes} onChange={handleFileUpload} disabled={uploading} />
            <span>{uploading ? "Uploading to S3..." : "Choose files to upload"}</span>
          </label>
          {uploadError && <p className="status-line" style={{ color: "var(--danger, #ef4444)", marginTop: "0.5rem" }}>{uploadError}</p>}
        </section>
      )}

      {activeTab === "sharepoint" && (
        <section className="setup-card tab-content">
          <h3>SharePoint Repository by Domain</h3>
          <p className="section-caption">
            Requires an Azure AD app registration with <strong>Sites.Read.All</strong> and <strong>Files.Read.All</strong> permissions.
          </p>
          <div className="config-grid">
            <label className="field">
              <span>Tenant ID</span>
              <input
                type="text"
                value={spTenantId}
                onChange={(e) => setSpTenantId(e.target.value)}
                placeholder="Azure AD tenant id"
              />
            </label>
            <label className="field">
              <span>Application (Client) ID</span>
              <input
                type="text"
                value={spClientId}
                onChange={(e) => setSpClientId(e.target.value)}
                placeholder="Azure app registration client id"
              />
            </label>
            <label className="field">
              <span>Client Secret</span>
              <input
                type="password"
                value={spClientSecret}
                onChange={(e) => setSpClientSecret(e.target.value)}
                placeholder="Client secret value"
                autoComplete="current-password"
              />
            </label>
            <label className="field">
              <span>SharePoint Site URL</span>
              <input
                type="text"
                value={spSiteUrl}
                onChange={(e) => setSpSiteUrl(e.target.value)}
                placeholder="https://tenant.sharepoint.com/sites/BudgetOffice"
              />
            </label>
            <label className="field">
              <span>Library / Folder Path</span>
              <input
                type="text"
                value={spLibrary}
                onChange={(e) => setSpLibrary(e.target.value)}
                placeholder="Shared Documents/FY26"
              />
            </label>
            <label className="field">
              <span>Domain for SharePoint sync</span>
              <select value={spDomain} onChange={(e) => setSpDomain(e.target.value)}>
                {domains.map((domain) => (
                  <option key={domain} value={domain}>{domain}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="inline-actions">
            <button type="button" className="action-btn" onClick={handleSharePointTest} disabled={spTesting}>
              {spTesting ? "Testing..." : "Test & Save Connection"}
            </button>
            {spStatusOk && (
              <button type="button" className="action-btn" onClick={handleSharePointSync} disabled={spSyncing}>
                {spSyncing ? "Syncing..." : "Sync Files"}
              </button>
            )}
            <p className="status-line" style={{ color: spStatusOk ? "var(--accent, #22c55e)" : undefined }}>
              {sharePointStatus}
            </p>
          </div>
          {spSyncResult && (
            <div className="metric-strip" style={{ marginTop: "1rem" }}>
              <div>
                <p>Files Found</p>
                <strong>{spSyncResult.totalFiles}</strong>
              </div>
              <div>
                <p>New Documents</p>
                <strong>{spSyncResult.newDocuments}</strong>
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === "links" && (
        <section className="setup-card tab-content">
          <h3>Public Link Ingestion by Domain</h3>
          <p className="section-caption">Fetches the URL, extracts text (HTML pages, PDFs, DOCX, XLSX, etc.) and saves as a knowledge document pending review.</p>
          <div className="config-grid two-col">
            <label className="field">
              <span>Domain for public link</span>
              <select value={linkDomain} onChange={(event) => setLinkDomain(event.target.value)}>
                {domains.map((domain) => (
                  <option key={domain} value={domain}>{domain}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Department</span>
              <select value={linkDeptCode} onChange={(event) => setLinkDeptCode(event.target.value)} disabled={departments.length === 0}>
                {departments.length === 0
                  ? <option value="">Loading...</option>
                  : departments.map((dept) => (
                    <option key={dept.code} value={dept.code}>{dept.name} ({dept.code})</option>
                  ))
                }
              </select>
            </label>
          </div>
          <div className="inline-input">
            <input
              type="url"
              value={publicLink}
              onChange={(event) => setPublicLink(event.target.value)}
              placeholder="https://example.edu/budget-policy"
              disabled={ingestingLink}
              onKeyDown={(e) => e.key === "Enter" && addPublicLink()}
            />
            <button type="button" className="action-btn" onClick={addPublicLink} disabled={ingestingLink || !publicLink.trim()}>
              {ingestingLink ? "Fetching..." : "Ingest Link"}
            </button>
          </div>
          {linkError && <p className="status-line" style={{ color: "var(--danger, #ef4444)", marginTop: "0.5rem" }}>{linkError}</p>}
          {linkSuccess && <p className="status-line" style={{ color: "var(--accent, #22c55e)", marginTop: "0.5rem" }}>{linkSuccess}</p>}
        </section>
      )}

      {activeTab === "coverage" && (
        <section className="setup-card tab-content">
          <h3>Domain Coverage Snapshot</h3>
          <p className="section-caption">Documents indexed per knowledge domain.</p>
          <div className="domain-coverage-list">
            {domains.map((domain) => {
              const count = domainStats[domain] || 0;
              const max = Math.max(...Object.values(domainStats), 1);
              const pct = Math.round((count / max) * 100);
              return (
                <div key={domain} className="domain-coverage-item">
                  <div className="domain-coverage-info">
                    <span className="domain-coverage-name">{domain}</span>
                    <span className="domain-coverage-count">{count} source{count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="domain-bar-track">
                    <div className="domain-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "search" && (
        <section className="setup-card tab-content">
          <h3>Search Knowledge Base</h3>
          <p className="section-caption">Semantic search across all indexed documents. Filter by domain or department to narrow results.</p>

          <form onSubmit={handleSearch}>
            <div className="config-grid two-col" style={{ marginBottom: "0.75rem" }}>
              <label className="field">
                <span>Domain (optional)</span>
                <select value={searchDomain} onChange={(e) => setSearchDomain(e.target.value)}>
                  <option value="">All domains</option>
                  {domains.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Department (optional)</span>
                <select value={searchDept} onChange={(e) => setSearchDept(e.target.value)}>
                  <option value="">All departments</option>
                  {departments.map((dept) => (
                    <option key={dept.code} value={dept.code}>{dept.name} ({dept.code})</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="inline-input">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. capital expenditure policy FY26"
                disabled={searchLoading}
              />
              <button type="submit" className="action-btn" disabled={searchLoading || !searchQuery.trim()}>
                {searchLoading ? "Searching..." : "Search"}
              </button>
            </div>
          </form>

          {searchError && (
            <p className="status-line" style={{ color: "var(--danger, #ef4444)", marginTop: "0.75rem" }}>{searchError}</p>
          )}

          {searchResults !== null && (
            <div style={{ marginTop: "1rem" }}>
              {searchResults.length === 0 ? (
                <p className="section-caption">No matching chunks found.</p>
              ) : (
                <>
                  <p className="section-caption" style={{ marginBottom: "0.5rem" }}>{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</p>
                  {searchResults.map((r, i) => (
                    <div
                      key={r.chunkId || i}
                      className="search-result-item"
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.4rem" }}>
                        <strong style={{ fontSize: "0.9rem" }}>{r.title || "Untitled"}</strong>
                        <span style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          {r.domain && <span className="status-chip pending">{r.domain}</span>}
                          {r.department && <span className="status-chip">{r.department}</span>}
                          {r.score != null && (
                            <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                              score: {Number(r.score).toFixed(3)}
                            </span>
                          )}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.82rem", opacity: 0.8, margin: 0, lineHeight: 1.55 }}>
                        {r.excerpt || r.text || ""}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "queue" && (
        <section className="setup-card tab-content">
          <h3>Ingestion Queue</h3>
          <p className="section-caption">
            Uploaded files and ingested URLs are saved as knowledge documents pending admin review.
            Use <strong>Submit</strong> to force re-index, or <strong>Remove</strong> to discard a row.
          </p>

          <div className="inline-actions" style={{ marginBottom: "0.75rem" }}>
            <button
              type="button"
              className="action-btn"
              onClick={handleSubmitAll}
              disabled={submitAllBusy || uploadedItems.filter((i) => i.documentId).length === 0}
            >
              {submitAllBusy ? "Submitting All..." : "Submit All to Knowledge Base"}
            </button>
          </div>

          {queueMessage && (
            <p className="status-line" style={{ marginBottom: "0.5rem" }}>{queueMessage}</p>
          )}

          <div className="queue-table">
            <div className="queue-table-inner">
            <div className="queue-row queue-head">
              <span>Source Item</span>
              <span>Origin</span>
              <span>Size/Type</span>
              <span>Domain</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {uploadedItems.length === 0 && <p className="empty-queue" style={{ minWidth: "unset" }}>No items ingested yet.</p>}
            {uploadedItems.map((item) => {
              const isBusy = submittingIds.has(item.id) || deletingIds.has(item.id) || reuploadingIds.has(item.id) || item.status === "uploading";
              return (
                <div className="queue-row" key={item.id}>
                  <span title={item.name}>{item.name}</span>
                  <span>{item.source}</span>
                  <span>{item.size}</span>
                  <select
                    value={item.domain}
                    onChange={(event) => updateItemDomain(item.id, event.target.value)}
                    disabled={isBusy}
                  >
                    {domains.map((domain) => (
                      <option key={domain} value={domain}>{domain}</option>
                    ))}
                  </select>
                  <span style={{
                    color: item.status === "done"
                      ? "var(--accent, #22c55e)"
                      : item.status === "error"
                      ? "var(--danger, #ef4444)"
                      : "var(--muted, #94a3b8)",
                    fontSize: "0.8rem",
                    fontWeight: 600
                  }}>
                    {item.status === "uploading" || submittingIds.has(item.id) || reuploadingIds.has(item.id)
                      ? "Processing..."
                      : item.status === "done"
                      ? "Saved"
                      : item.status === "error"
                      ? "Failed"
                      : "Queued"}
                  </span>
                  <span style={{ display: "flex", gap: "0.35rem" }}>
                    {item.documentId && (
                      <button
                        type="button"
                        className="action-btn"
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.72rem" }}
                        disabled={isBusy}
                        onClick={() => handleSubmitItem(item)}
                      >
                        {submittingIds.has(item.id) ? "…" : "Re-index"}
                      </button>
                    )}
                    {item.documentId && (
                      <label
                        className="action-btn"
                        style={{
                          padding: "0.2rem 0.5rem",
                          fontSize: "0.72rem",
                          cursor: isBusy ? "not-allowed" : "pointer",
                          opacity: isBusy ? 0.5 : 1,
                          background: "var(--info-soft, #dbeafe)",
                          color: "var(--info, #2563eb)",
                          borderColor: "var(--info-border, #93c5fd)"
                        }}
                      >
                        {reuploadingIds.has(item.id) ? "Uploading..." : "Re-upload"}
                        <input
                          type="file"
                          accept={allowedFileTypes}
                          style={{ display: "none" }}
                          disabled={isBusy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) handleReupload(item, file);
                          }}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="action-btn"
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.72rem", background: "var(--danger-soft, #fee2e2)", color: "var(--danger, #dc2626)", borderColor: "var(--danger-border, #fca5a5)" }}
                      disabled={isBusy}
                      onClick={() => handleDeleteItem(item)}
                    >
                      {deletingIds.has(item.id) ? "Deleting…" : "Delete"}
                    </button>
                  </span>
                </div>
              );
            })}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
