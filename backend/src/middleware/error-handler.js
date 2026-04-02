export function errorHandler(error, _req, res, _next) {
  let statusCode = error.statusCode || 500;
  let message = error.message || "Internal server error";

  if (!error.statusCode && error.code === "23505") {
    statusCode = 409;
    message = "A record with the same value already exists.";
  }

  if (!error.statusCode && error.code === "23503") {
    statusCode = 409;
    message = "This record is referenced by other data and cannot be deleted.";
  }

  const code = error.statusCode ? error.code : statusCode === 500 ? "INTERNAL_ERROR" : undefined;

  if (statusCode >= 500) {
    console.error(error);
  }

  const payload = { message };
  if (code) {
    payload.code = code;
  }

  res.status(statusCode).json(payload);
}
