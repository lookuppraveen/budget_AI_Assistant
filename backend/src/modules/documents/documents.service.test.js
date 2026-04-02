import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/db.js", () => ({
  pool: { query: vi.fn() }
}));
vi.mock("../../config/s3.js", () => ({
  s3Client: {}
}));
vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn()
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://s3.example.com/presigned-url")
}));
vi.mock("../../utils/extract-text.js", () => ({
  extractText: vi.fn().mockResolvedValue("extracted text content")
}));
vi.mock("../retrieval/retrieval.service.js", () => ({
  indexApprovedDocumentChunks: vi.fn().mockResolvedValue(undefined)
}));

import { pool } from "../../config/db.js";
import { listDocuments, updateDocumentStatus } from "./documents.service.js";

describe("documents.service — listDocuments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns all documents when no filters", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: "doc-1", title: "Budget Policy", source_type: "Upload", domain: "Budgeting", status: "Approved", department: "Finance", department_code: "FIN", metadata: {} }
      ]
    });
    const result = await listDocuments({});
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Budget Policy");
  });

  it("filters by departmentId when provided", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await listDocuments({ departmentId: "dept-uuid-1" });
    const callArg = pool.query.mock.calls[0][0];
    expect(callArg).toContain("kd.department_id");
  });

  it("filters by departmentCode when no departmentId", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await listDocuments({ departmentCode: "FIN" });
    const callArg = pool.query.mock.calls[0][0];
    expect(callArg).toContain("upper(d.code)");
  });

  it("filters by status when provided", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await listDocuments({ status: "Pending" });
    const callArg = pool.query.mock.calls[0][0];
    expect(callArg).toContain("kd.status");
  });
});

describe("documents.service — updateDocumentStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws 404 when document not found", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(updateDocumentStatus("nonexistent", "Approved", null, "reviewer-1"))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("calls indexApprovedDocumentChunks when status is Approved", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "doc-1", title: "Budget Policy", status: "Approved", domain: "Budgeting", raw_text: "some text" }]
    });
    const { indexApprovedDocumentChunks } = await import("../retrieval/retrieval.service.js");
    await updateDocumentStatus("doc-1", "Approved", null, "reviewer-1");
    expect(indexApprovedDocumentChunks).toHaveBeenCalledWith("doc-1");
  });
});
