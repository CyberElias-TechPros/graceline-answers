/**
 * Typed application errors.
 *
 * Every non-2xx response the Worker produces is one of these, so the client
 * always receives a stable machine-readable `code` alongside a human `message`
 * that is safe to display. Internal detail never crosses this boundary.
 */
export type ErrorCode =
  | "bad_request"
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_many_requests"
  | "payload_too_large"
  | "unprocessable"
  | "server_error";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_many_requests: 429,
  payload_too_large: 413,
  unprocessable: 422,
  server_error: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, string[]>;
  /** Optional developer-only context; logged, never returned to clients. */
  override readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: Record<string, string[]>; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
    this.cause = options.cause;
  }

  static badRequest(message = "The request could not be understood.", cause?: unknown) {
    return new AppError("bad_request", message, { cause });
  }

  static validation(details: Record<string, string[]>, message = "Please check the highlighted fields.") {
    return new AppError("validation_error", message, { details });
  }

  static unauthorized(message = "Please sign in to continue.") {
    return new AppError("unauthorized", message);
  }

  static forbidden(message = "You do not have permission to do that.") {
    return new AppError("forbidden", message);
  }

  static notFound(message = "We could not find what you were looking for.") {
    return new AppError("not_found", message);
  }

  static conflict(message: string) {
    return new AppError("conflict", message);
  }

  static rateLimited(retryAfterSeconds: number) {
    return new AppError("too_many_requests", "That was a little too fast. Please try again shortly.", {
      details: { retry_after: [String(retryAfterSeconds)] },
    });
  }

  static serverError(cause?: unknown) {
    return new AppError("server_error", "Something went wrong on our end. Please try again.", { cause });
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function statusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}
