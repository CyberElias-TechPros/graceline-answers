import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logging";
import { readCookie, verifySession, CSRF_COOKIE, SESSION_COOKIE } from "../lib/session";
import { timingSafeEqual } from "../lib/tokens";
import { findActiveById, toPublicUser } from "../db/users";
import type { PublicUser } from "../types";
import type { AppContext } from "../app";

/**
 * Authentication & authorization.
 *
 * Two rules make this safe:
 *
 * 1. The JWT is never trusted on its own. Every authenticated request re-reads
 *    the `users` row and requires `is_active = 1`, so disabling an account
 *    revokes its sessions immediately — the usual weakness of stateless tokens.
 * 2. Ownership and role checks happen here, on the server, before any handler
 *    body runs. Nothing in the frontend can widen these.
 */

const jwtSecretCache = new WeakMap<object, string>();

function secretFor(c: { env: { JWT_SECRET: string; ENVIRONMENT?: string } }): string {
  const cached = jwtSecretCache.get(c.env);
  if (cached) return cached;
  const secret = (c.env.JWT_SECRET ?? "").trim();
  if (secret.length < 32) {
    if (c.env.ENVIRONMENT === "production") {
      throw new Error("[graceline] JWT_SECRET must be at least 32 characters in production.");
    }
    throw AppError.serverError(new Error("JWT_SECRET is not configured"));
  }
  jwtSecretCache.set(c.env, secret);
  return secret;
}

/** Resolve the signed-in counselor, or null. Never throws for a missing cookie. */
export const attachUser = createMiddleware<AppContext>(async (c, next) => {
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  if (!token) {
    c.set("user", null);
    return next();
  }
  try {
    const claims = await verifySession(token, secretFor(c));
    const row = await findActiveById(c.env.DB, claims.userId);
    c.set("user", row ? toPublicUser(row) : null);
  } catch (error) {
    // An invalid or expired token is not an error condition for public routes;
    // protected routes reject it below with a proper 401.
    logger.debug("session_rejected", {
      request_id: c.get("requestId"),
      reason: error instanceof Error ? error.message : "unknown",
    });
    c.set("user", null);
  }
  return next();
});

/** Require a signed-in counselor. 401 otherwise. */
export const requireAuth = createMiddleware<AppContext>(async (c, next) => {
  const user = c.get("user");
  if (!user) throw AppError.unauthorized();
  return next();
});

/** Require a specific role. 403 when signed in but not permitted. */
export function requireRole(...roles: Array<PublicUser["role"]>) {
  return createMiddleware<AppContext>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw AppError.unauthorized();
    if (!roles.includes(user.role)) {
      logger.warn("authorization_denied", {
        request_id: c.get("requestId"),
        actor: user.email,
        role: user.role,
        path: new URL(c.req.url).pathname,
      });
      throw AppError.forbidden("That action needs an administrator account.");
    }
    return next();
  });
}

/**
 * CSRF protection for state-changing requests.
 *
 * Sessions ride in a cookie, so a cross-site form could otherwise trigger a
 * privileged action. We require the value of the readable `gl_csrf` cookie to be
 * echoed in the `x-csrf-token` header. A third-party page cannot read that
 * cookie (same-origin policy) and cannot add a custom header cross-origin
 * without a CORS preflight, which we do not answer — so the attack has no path.
 *
 * GET/HEAD/OPTIONS are exempt: they never mutate.
 */
export const requireCsrf = createMiddleware<AppContext>(async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  const cookieValue = readCookie(c.req.raw, CSRF_COOKIE);
  const headerValue = c.req.header("x-csrf-token");

  if (!cookieValue || !headerValue || !timingSafeEqual(cookieValue, headerValue)) {
    logger.warn("csrf_rejected", {
      request_id: c.get("requestId"),
      path: new URL(c.req.url).pathname,
      method,
    });
    throw AppError.forbidden("Your session needs to be refreshed. Please reload and try again.");
  }
  return next();
});
