import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";

export async function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const error = new Error("Authentication token missing");
    error.statusCode = 401;
    error.code = "AUTH_TOKEN_MISSING";
    return next(error);
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.jwtSecret);

    // Verify user still exists and is active in the database
    const result = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND is_active = true",
      [payload.id]
    );

    if (result.rowCount === 0) {
      const error = new Error("User account not found or inactive");
      error.statusCode = 401;
      error.code = "TOKEN_INVALID";
      return next(error);
    }

    req.user = payload;
    return next();
  } catch (verifyError) {
    if (verifyError.statusCode === 401) return next(verifyError);
    const error =
      verifyError?.name === "TokenExpiredError"
        ? new Error("Authentication token expired")
        : new Error("Invalid authentication token");
    error.statusCode = 401;
    error.code = verifyError?.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "TOKEN_INVALID";
    return next(error);
  }
}
