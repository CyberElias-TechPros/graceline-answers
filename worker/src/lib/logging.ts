/**
 * Structured logging.
 *
 * One JSON object per line so Cloudflare's log push / Workers Observability can
 * index fields. We never log passwords, session tokens, CSRF tokens, seeker
 * message bodies, or raw question text — those are the exact things a leaked log
 * would expose.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minimumLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  minimumLevel = level;
}

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: LogLevel, msg: string, fields: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel]) return;
  const cleaned: Record<string, unknown> = { level, msg, ts: Date.now() };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== "") cleaned[key] = value;
  }
  const line = JSON.stringify(cleaned);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields: LogFields = {}) => emit("debug", msg, fields),
  info: (msg: string, fields: LogFields = {}) => emit("info", msg, fields),
  warn: (msg: string, fields: LogFields = {}) => emit("warn", msg, fields),
  error: (msg: string, fields: LogFields = {}) => emit("error", msg, fields),
};

/** Generate a correlation id so a user report can be traced through the logs. */
export function newRequestId(incoming?: string | null): string {
  if (incoming && /^[A-Za-z0-9._-]{1,64}$/.test(incoming)) return incoming;
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/**
 * Fields that must never reach a log line. Enforced centrally so a careless
 * `logger.info("...", body)` cannot leak a password.
 */
const REDACTED_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "tracking_token",
  "session",
  "cookie",
  "authorization",
  "csrf",
  "api_key",
]);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? "[redacted]" : redact(val, depth + 1);
  }
  return out;
}
