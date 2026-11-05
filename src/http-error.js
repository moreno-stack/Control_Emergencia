export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function parseInput(schema, input) {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Los datos enviados no son válidos.", result.error.issues);
  }

  return result.data;
}
