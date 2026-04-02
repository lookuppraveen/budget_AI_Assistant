export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      error.code = "AUTH_REQUIRED";
      return next(error);
    }

    if (!allowedRoles.includes(req.user.role)) {
      const error = new Error("Access denied");
      error.statusCode = 403;
      error.code = "ACCESS_DENIED";
      return next(error);
    }

    return next();
  };
}
