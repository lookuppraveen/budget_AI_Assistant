import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "../../config/db.js";
import { env } from "../../config/env.js";
import { sendMail } from "../../utils/mailer.js";

function toAuthPayload(row) {
  return {
    sub: row.id,
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    departmentId: row.departmentId || row.department_id || null
  };
}

function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn
  });
}

export async function signupUser({ name, email, password, departmentCode }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM users WHERE lower(email) = lower($1)", [email]);
    if (existing.rowCount > 0) {
      const error = new Error("User already exists with this email");
      error.statusCode = 409;
      throw error;
    }

    // New registrations always start with Read Only — admin can promote later
    const roleResult = await client.query("SELECT id, name FROM roles WHERE name = $1", ["Read Only"]);
    if (roleResult.rowCount === 0) {
      const error = new Error("Default role 'Read Only' not found. Contact an administrator.");
      error.statusCode = 500;
      throw error;
    }

    const departmentResult = await client.query(
      "SELECT id, name FROM departments WHERE upper(code) = upper($1)",
      [departmentCode]
    );

    if (departmentResult.rowCount === 0) {
      const error = new Error("Invalid department code");
      error.statusCode = 400;
      throw error;
    }

    const hash = await bcrypt.hash(password, 12);

    const inserted = await client.query(
      `INSERT INTO users (name, email, password_hash, role_id, department_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, name, email`,
      [name, email.toLowerCase(), hash, roleResult.rows[0].id, departmentResult.rows[0].id]
    );

    await client.query("COMMIT");

    const payload = {
      ...inserted.rows[0],
      role: roleResult.rows[0].name,
      department: departmentResult.rows[0].name,
      department_id: departmentResult.rows[0].id
    };

    return {
      user: payload,
      token: signToken(toAuthPayload(payload))
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loginUser({ email, password }) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.is_active,
            r.name AS role, d.name AS department, d.id AS department_id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN departments d ON d.id = u.department_id
     WHERE lower(u.email) = lower($1)`,
    [email]
  );

  if (result.rowCount === 0) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const user = result.rows[0];

  if (!user.is_active) {
    const error = new Error("User account is inactive");
    error.statusCode = 403;
    throw error;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    department_id: user.department_id
  };

  return {
    user: payload,
    token: signToken(toAuthPayload(payload))
  };
}

export async function getCurrentUser(userId) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.is_active,
            r.name AS role, d.name AS department, d.id AS department_id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN departments d ON d.id = u.department_id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rowCount === 0) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
}

export async function createPasswordResetRequest(email) {
  const result = await pool.query(
    "SELECT id, name, email FROM users WHERE lower(email) = lower($1) AND is_active = true",
    [email]
  );

  // Always respond the same way to avoid email enumeration
  if (result.rowCount === 0) return { accepted: true };

  const user = result.rows[0];
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, token, expiresAt.toISOString()]
  );

  const resetLink = `${env.frontendUrl}/reset-password?token=${token}`;

  const html = `
    <p>Hi ${user.name},</p>
    <p>A password reset was requested for your Budget AI Assistant account.</p>
    <p><a href="${resetLink}">Click here to reset your password</a></p>
    <p>This link expires in <strong>1 hour</strong>. If you did not request this, ignore this email.</p>
  `;

  // Non-fatal — if email fails, we still return accepted (user can retry)
  try {
    await sendMail({ to: user.email, subject: "Budget AI Assistant — Password Reset", html });
  } catch (err) {
    console.error("[auth] password reset email failed:", err.message);
  }

  return { accepted: true };
}

export async function resetPassword(token, newPassword) {
  const result = await pool.query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token = $1
       AND used = false
       AND expires_at > now()`,
    [token]
  );

  if (result.rowCount === 0) {
    throw Object.assign(new Error("Reset token is invalid or has expired."), { statusCode: 400 });
  }

  const { id: tokenId, user_id: userId } = result.rows[0];
  const hash = await bcrypt.hash(newPassword, 12);

  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, userId]);
  await pool.query("UPDATE password_reset_tokens SET used = true WHERE id = $1", [tokenId]);

  return { reset: true };
}