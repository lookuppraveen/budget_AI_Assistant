import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/db.js", () => ({
  pool: { query: vi.fn() }
}));
vi.mock("node-cron", () => ({
  default: {
    validate: vi.fn().mockReturnValue(true),
    schedule: vi.fn().mockReturnValue({ stop: vi.fn() })
  }
}));
vi.mock("../../utils/mailer.js", () => ({
  sendMail: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("xlsx", () => ({
  utils: {
    book_new: vi.fn().mockReturnValue({}),
    json_to_sheet: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn()
  },
  write: vi.fn().mockReturnValue(Buffer.from("mock-xlsx"))
}));

import { pool } from "../../config/db.js";
import { createReport, listReports, scheduleReport } from "./reports.service.js";

describe("reports.service — listReports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns mapped report rows", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: "rpt-1", report_name: "Monthly Budget", owner: "Alice",
        frequency: "Monthly", status: "Ready",
        schedule_cron: null, last_run_at: null,
        created_at: new Date(), updated_at: new Date()
      }]
    });
    const reports = await listReports();
    expect(reports).toHaveLength(1);
    expect(reports[0].name).toBe("Monthly Budget");
    expect(reports[0].status).toBe("Ready");
  });
});

describe("reports.service — createReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves owner name from DB", async () => {
    pool.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ name: "Alice" }] }) // user lookup
      .mockResolvedValueOnce({
        rows: [{
          id: "rpt-2", report_name: "Q1 Report", owner: "Alice",
          frequency: "Quarterly", status: "Draft",
          created_at: new Date(), updated_at: new Date()
        }]
      });

    const report = await createReport({ reportName: "Q1 Report", frequency: "Quarterly" }, "user-1");
    expect(report.name).toBe("Q1 Report");
    expect(report.owner).toBe("Alice");
  });
});

describe("reports.service — scheduleReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws 404 when report not found", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(scheduleReport("nonexistent-id", { scheduleCron: "0 6 * * 1" }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns updated report on success", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "rpt-1", report_name: "Test", status: "Scheduled", schedule_cron: "0 6 * * 1" }]
    });
    const result = await scheduleReport("rpt-1", { scheduleCron: "0 6 * * 1" });
    expect(result.status).toBe("Scheduled");
  });
});
