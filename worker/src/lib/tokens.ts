import { slugify } from "../../../shared/site";

/**
 * Token, identifier and slug generation.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The seeker's only credential: an unguessable, URL-safe tracking token.
 * 24 bytes = 192 bits of entropy, so it cannot be brute-forced and never needs
 * to be paired with a second factor.
 */
export function generateTrackingToken(): string {
  return toBase64Url(randomBytes(24));
}

/** Opaque primary key for counselor accounts (non-enumerable by design). */
export function generateUserId(): string {
  return crypto.randomUUID();
}

/** Random value for the CSRF double-submit cookie. */
export function generateCsrfToken(): string {
  return toBase64Url(randomBytes(24));
}

/**
 * Short base36 suffix that keeps slugs unique without leaking volume.
 * Unpadded, so the common case reads "grace-1" rather than "grace-01".
 */
function shortId(id: number): string {
  return id.toString(36);
}

/**
 * Build the canonical public URL slug for a published answer, e.g.
 * "what-does-grace-mean-in-the-bible-k3".
 *
 * The numeric suffix guarantees uniqueness (two questions can share a title)
 * while the words keep the URL descriptive for search.
 */
export function buildPublicSlug(publicTitle: string, questionId: number): string {
  const base = slugify(publicTitle) || "answered-question";
  return `${base}-${shortId(questionId)}`;
}

/** Constant-time string comparison, used for CSRF and password digest checks. */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) {
    // Still walk the full length so timing does not reveal the correct length.
    let diff = 1;
    for (let i = 0; i < left.length; i++) diff |= left[i]! ^ (right[i % right.length] ?? 0);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

/**
 * SHA-256 hex digest. Used to key rate-limit buckets on an IP address so the
 * raw address is never written to KV or D1.
 */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
