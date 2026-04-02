export function validate(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const error = new Error(issue?.message || "Validation failed");
      error.statusCode = 400;
      return next(error);
    }

    req.validated = parsed.data;
    return next();
  };
}