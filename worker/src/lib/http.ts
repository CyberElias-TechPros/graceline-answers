import { AppError, isAppError } from "./errors";

/**
 * HTTP plumbing: JSON serialisation, error mapping, security headers, CORS.
 */

export type Json = Record<string, unknown>;

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

/**
 * Error → Response. AppErrors map to their declared status with a stable code;
 * anything else becomes an opaque 500 so implementation detail never leaks.
 */
export function errorResponse(error: unknown, requestId?: string): Response {
  const requestIdHeader: Record<string, string> = requestId ? { "x-request-id": requestId } : {};

  if (isAppError(error)) {
    const body: Json = { error: error.code, message: error.message };
    if (error.details) body.details = error.details;
    if (requestId) body.request_id = requestId;

    const headers: Record<string, string> = { ...requestIdHeader };
    if (error.code === "too_many_requests" && error.details?.retry_after?.[0]) {
      headers["retry-after"] = error.details.retry_after[0];
    }
    return json(body, { status: error.status, headers });
  }

  // Unknown failure: log with enough context to debug, return nothing useful.
  console.error(
    JSON.stringify({
      level: "error",
      msg: "unhandled_error",
      request_id: requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  return json(
    {
      error: "server_error",
      message: "Something went wrong on our end. Please try again.",
      ...(requestId ? { request_id: requestId } : {}),
    },
    { status: 500, headers: requestIdHeader },
  );
}

/**
 * Response headers applied to every API response.
 *
 * The API only ever emits JSON, so the CSP is maximally strict — this means a
 * reflected value can never be interpreted as script even if a future route
 * forgets to escape something.
 */
export function securityHeaders(env: { ENVIRONMENT?: string }): Record<string, string> {
  const headers: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-site",
    "content-security-policy":
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "x-request-id": "",
  };
  // HSTS only once we are certain the origin is HTTPS-only (always true in prod).
  if (env.ENVIRONMENT === "production") {
    headers["strict-transport-security"] = "max-age=63072000; includeSubDomains; preload";
  }
  return headers;
}

/**
 * Cross-origin policy for the API.
 *
 * In production the frontend reaches the API through a same-origin Vercel
 * rewrite (`/api/*` → Worker), so no CORS headers are needed and none are
 * emitted — the safest possible default. `ALLOWED_ORIGINS` exists for local
 * development where the Vite dev server runs on a different port.
 */
export function corsHeaders(request: Request, env: { ALLOWED_ORIGINS?: string }): Record<string, string> {
  const allowList = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowList.length === 0) return {};

  const origin = request.headers.get("origin");
  if (!origin || !allowList.includes(origin)) return {};

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, x-csrf-token, x-request-id",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

/**
 * Client IP, best effort. Cloudflare always sets CF-Connecting-IP; we fall back
 * to X-Forwarded-For's first hop. Used only as a transient rate-limit key and
 * hashed before it is ever written to KV — never persisted to D1.
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<Json> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) {
    throw new AppError("payload_too_large", "That message is longer than we can accept.");
  }
  let text: string;
  try {
    text = await request.text();
  } catch (cause) {
    throw AppError.badRequest("The request body could not be read.", cause);
  }
  if (text.length > maxBytes) {
    throw new AppError("payload_too_large", "That message is longer than we can accept.");
  }
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw AppError.badRequest("Expected a JSON object.");
    }
    return parsed as Json;
  } catch (cause) {
    if (isAppError(cause)) throw cause;
    throw AppError.badRequest("Expected valid JSON.", cause);
  }
}
