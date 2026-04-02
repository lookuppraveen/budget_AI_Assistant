import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function authenticate(req, _res, next) {
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
    req.user = payload;
    return next();
  } catch (verifyError) {
    const error =
      verifyError?.name === "TokenExpiredError"
        ? new Error("Authentication token expired")
        : new Error("Invalid authentication token");
    error.statusCode = 401;
    error.code = verifyError?.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "TOKEN_INVALID";
    return next(error);
  }
}
