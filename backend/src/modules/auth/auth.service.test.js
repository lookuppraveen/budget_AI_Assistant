import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("../../config/db.js", () => ({
  pool: { query: vi.fn() }
}));
vi.mock("../../utils/mailer.js", () => ({
  sendMail: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$hashed$"),
    compare: vi.fn()
  }
}));
vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn().mockReturnValue("mock.jwt.token"),
    verify: vi.fn()
  }
}));

import { pool } from "../../config/db.js";
import bcrypt from "bcryptjs";
import { loginUser, signupUser } from "./auth.service.js";

describe("auth.service — loginUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws 401 when user not found", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(loginUser({ email: "no@example.com", password: "pass" }))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws 403 when user is inactive", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "1", name: "A", email: "a@b.com", password_hash: "$hashed$", is_active: false, role: "Admin", department: "IT", department_id: "d1" }]
    });
    await expect(loginUser({ email: "a@b.com", password: "pass" }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 401 when password is wrong", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "1", name: "A", email: "a@b.com", password_hash: "$hashed$", is_active: true, role: "Admin", department: "IT", department_id: "d1" }]
    });
    bcrypt.compare.mockResolvedValueOnce(false);
    await expect(loginUser({ email: "a@b.com", password: "wrong" }))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  it("returns user and token on success", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "uuid-1", name: "Alice", email: "alice@test.com", password_hash: "$hashed$", is_active: true, role: "Admin", department: "Finance", department_id: "dept-1" }]
    });
    bcrypt.compare.mockResolvedValueOnce(true);

    const result = await loginUser({ email: "alice@test.com", password: "Password1!" });
    expect(result.token).toBe("mock.jwt.token");
    expect(result.user.email).toBe("alice@test.com");
    expect(result.user.role).toBe("Admin");
  });
});

describe("auth.service — signupUser", () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    pool.connect = vi.fn().mockResolvedValue(mockClient);
  });

  it("throws 409 when email already exists", async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "existing" }] }); // duplicate check

    await expect(signupUser({ name: "Bob", email: "bob@test.com", password: "Password1!", role: "Admin", departmentCode: "FIN" }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("throws 400 for invalid role", async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // no duplicate
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // role not found

    await expect(signupUser({ name: "Bob", email: "bob@test.com", password: "Password1!", role: "Nonexistent", departmentCode: "FIN" }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
