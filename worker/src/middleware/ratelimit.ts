import type { Context, MiddlewareHandler } from "hono";
import { enforceRateLimit, rateLimitHeaders, RULES, type RateLimitRule } from "../lib/ratelimit";
import { clientIp } from "../lib/http";
import type { AppContext } from "../app";

/**
 * Rate limiting middleware.
 *
 * Identity is the client IP by default — hashed before it reaches KV, so the raw
 * address is never stored. Routes with a better key (a signed-in account) pass
 * `identityFor` so one busy household does not lock out its neighbours.
 */
export function rateLimit(
  rule: RateLimitRule,
  options: { identityFor?: (c: Context<AppContext>) => string | Promise<string> } = {},
): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const identity = options.identityFor ? await options.identityFor(c) : clientIp(c.req.raw);
    const result = await enforceRateLimit(c.env.CACHE, rule, identity);
    for (const [key, value] of Object.entries(rateLimitHeaders(result, rule.limit))) {
      c.header(key, value);
    }
    return next();
  };
}

export const limits = RULES;
