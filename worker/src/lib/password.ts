import { timingSafeEqual } from "./tokens";

/**
 * Password hashing.
 *
 * The legacy app used `bcryptjs`. That is a pure-JavaScript implementation: at
 * cost 12 it burns 200ms+ of *CPU*, and Workers enforce a per-invocation CPU
 * limit, so a handful of concurrent logins would start hitting it. WebCrypto's
 * PBKDF2 is native, so the same security level costs a few milliseconds of CPU
 * and is comfortably within budget.
 *
 * 210,000 iterations of PBKDF2-HMAC-SHA256 is the OWASP recommendation for this
 * primitive. The stored format is self-describing so the iteration count can be
 * raised later and existing hashes keep verifying.
 */

const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const ALGORITHM = "pbkdf2";
const PREFIX = "pbkdf2-sha256";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), ALGORITHM, false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, hash: "SHA-256", salt: salt as unknown as BufferSource, iterations },
    keyMaterial,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toBase64(salt)}$${toBase64(key)}`;
}

/**
 * Verify a password against a stored hash.
 *
 * Always performs a derivation, even for a malformed stored value, so response
 * timing does not distinguish "no such account" from "wrong password".
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    // Burn comparable time before failing.
    await deriveKey(password, new Uint8Array(SALT_BYTES), 1000);
    return false;
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 1_000_000) {
    await deriveKey(password, new Uint8Array(SALT_BYTES), 1000);
    return false;
  }
  try {
    const salt = fromBase64(parts[2]!);
    const expected = fromBase64(parts[3]!);
    const actual = await deriveKey(password, salt, iterations);
    return timingSafeEqual(toBase64(actual), toBase64(expected));
  } catch {
    return false;
  }
}

/**
 * Whether a stored hash should be transparently re-hashed on next login
 * (e.g. after we raise ITERATIONS).
 */
export function needsRehash(stored: string): boolean {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) return true;
  return Number(parts[1]) !== ITERATIONS;
}
