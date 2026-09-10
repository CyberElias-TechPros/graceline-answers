import { SignJWT, jwtVerify } from "jose";
import { AppError } from "./errors";
import type { PublicUser } from "../types";

/**
 * Counselor sessions.
 *
 * Stateless HMAC-SHA256 JWTs in an httpOnly cookie. Stateless is the right call
 * here: the Worker runs on many isolates, so a server-side session store would
 * need a network round trip on every authenticated request. Revocation is
 * handled by `users.is_active` — the token is always checked against the row,
 * so disabling an account takes effect immediately without a denylist.
 */

const ISSUER = "graceline-answers";
const AUDIENCE = "graceline-counselors";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const SESSION_COOKIE = "gl_session";
export const CSRF_COOKIE = "gl_csrf";

const WEAK_SECRETS = new Set([
  "",
  "change_me_to_a_long_random_string",
  "dev-insecure-secret-change-me",
  "secret",
  "test",
]);

let cachedKey: { secret: string; key: Uint8Array } | null = null;

function signingKey(secret: string): Uint8Array {
  if (cachedKey?.secret === secret) return cachedKey.key;
  const key = new TextEncoder().encode(secret);
  cachedKey = { secret, key };
  return key;
}

/**
 * Validate the configured secret. Production refuses to boot with a guessable
 * key; development falls back to a per-isolate random key so there is never a
 * hardcoded secret in the repository.
 */
export function resolveJwtSecret(raw: string | undefined, environment: string): { secret: string; warned: boolean } {
  const secret = (raw ?? "").trim();
  if (secret.length >= 32 && !WEAK_SECRETS.has(secret)) return { secret, warned: false };
  if (environment === "production") {
    throw new Error(
      "[graceline] JWT_SECRET is missing or too weak. Set a secret of at least 32 characters.",
    );
  }
  return { secret: `dev-${crypto.randomUUID()}-${crypto.randomUUID()}`, warned: true };
}

export async function signSession(user: PublicUser, secret: string): Promise<string> {
  return new SignJWT({ role: user.role, email: user.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(signingKey(secret));
}

export type SessionClaims = { userId: string; role: "admin" | "counselor"; email: string };

export async function verifySession(token: string, secret: string): Promise<SessionClaims> {
  try {
    const { payload } = await jwtVerify(token, signingKey(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) throw new Error("missing subject");
    const role = payload.role;
    if (role !== "admin" && role !== "counselor") throw new Error("invalid role");
    return { userId: payload.sub, role, email: String(payload.email ?? "") };
  } catch {
    throw AppError.unauthorized("Your session has expired. Please sign in again.");
  }
}

type CookieOptions = {
  secure: boolean;
  maxAgeSeconds: number;
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
};

/**
 * Build a Set-Cookie header value.
 *
 * Scoped to `Path=/api` so the session cookie is never sent to the marketing
 * pages, and `SameSite=Lax` so cross-site form posts cannot ride along.
 */
export function buildCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [
    `${name}=${value}`,
    "Path=/api",
    `Max-Age=${options.maxAgeSeconds}`,
    `SameSite=${options.sameSite ?? "Lax"}`,
  ];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildDeletedCookie(name: string, secure: boolean): string {
  return buildCookie(name, "", { secure, maxAgeSeconds: 0 });
}

/** Read a cookie from a request header without pulling in a cookie parser. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}
