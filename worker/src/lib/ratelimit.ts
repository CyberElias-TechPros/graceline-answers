import { AppError } from "./errors";
import { sha256Hex } from "./tokens";

/**
 * Distributed rate limiting on KV.
 *
 * The legacy app used `express-rate-limit`'s in-memory store, which on an edge
 * runtime would give every isolate its own counter — an attacker could bypass it
 * simply by landing on different isolates. KV is shared, so a single limit
 * applies across the whole network.
 *
 * Algorithm: fixed-window counter. It is approximate at window boundaries
 * (worst case 2x the limit across a boundary) but it costs one KV read plus one
 * write, and KV keys expire on their own so there is no cleanup job and no
 * unbounded key growth.
 *
 * Privacy: the identifier is SHA-256 hashed before it becomes a key, so a raw
 * IP address is never written to storage. Keys expire with the window.
 */

export type RateLimitRule = {
  /** Stable name, e.g. "login", "submit-question". */
  name: string;
  /** Maximum requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export const RULES = {
  login: { name: "login", limit: 8, windowSeconds: 15 * 60 },
  submitQuestion: { name: "submit", limit: 10, windowSeconds: 60 * 60 },
  seekerMessage: { name: "msg-seeker", limit: 20, windowSeconds: 60 },
  prayerSubmit: { name: "prayer-post", limit: 6, windowSeconds: 60 * 60 },
  prayerCount: { name: "prayer-pray", limit: 30, windowSeconds: 60 },
  archiveSearch: { name: "search", limit: 60, windowSeconds: 60 },
  threadAccess: { name: "thread", limit: 120, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * Consume one unit from a bucket.
 *
 * `kv` is optional so unit tests and environments without the binding still run;
 * when absent we allow the request (fail-open) rather than take the product
 * down, and log so the misconfiguration is visible.
 */
export async function consumeRateLimit(
  kv: KVNamespace | undefined,
  rule: RateLimitRule,
  identity: string,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / (rule.windowSeconds * 1000));
  const key = `rl:${rule.name}:${windowStart}:${await sha256Hex(identity)}`;
  const resetAt = (windowStart + 1) * rule.windowSeconds * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));

  if (!kv) {
    console.warn(JSON.stringify({ level: "warn", msg: "rate_limit_unconfigured", rule: rule.name }));
    return { allowed: true, remaining: rule.limit - 1, resetAt, retryAfterSeconds: 0 };
  }

  let count: number;
  try {
    // `expirationTtl` makes the key self-destruct shortly after the window ends.
    count = Number((await kv.get(key)) ?? 0) + 1;
    await kv.put(key, String(count), { expirationTtl: rule.windowSeconds + 60 });
  } catch (cause) {
    // KV outage must not take the product down; fail open and surface the error.
    console.error(
      JSON.stringify({
        level: "error",
        msg: "rate_limit_kv_failure",
        rule: rule.name,
        error: cause instanceof Error ? cause.message : String(cause),
      }),
    );
    return { allowed: true, remaining: rule.limit - 1, resetAt, retryAfterSeconds: 0 };
  }

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt,
    retryAfterSeconds: count <= rule.limit ? 0 : retryAfterSeconds,
  };
}

/** Consume a unit and throw a 429 when the bucket is exhausted. */
export async function enforceRateLimit(
  kv: KVNamespace | undefined,
  rule: RateLimitRule,
  identity: string,
): Promise<RateLimitResult> {
  const result = await consumeRateLimit(kv, rule, identity);
  if (!result.allowed) throw AppError.rateLimited(result.retryAfterSeconds);
  return result;
}

/** Standard headers so well-behaved clients can back off without guessing. */
export function rateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
  return {
    "ratelimit-limit": String(limit),
    "ratelimit-remaining": String(result.remaining),
    "ratelimit-reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
