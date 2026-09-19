/**
 * Small shared utilities for the Cloudflare Worker.
 * Mirrors cpanel-app/server/util.js (no Node APIs — Worker-safe only).
 */

/**
 * Generate a URL-safe, cryptographically random token.
 * @param {number} bytes Number of random bytes (default 18 => ~144 bits).
 * @returns {string} URL-safe base64 token (no padding, no +/).
 */
export function randomToken(bytes = 18) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = '';
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Trim a string and clamp to a maximum length. */
export function clampString(value, maxLength, { trim = true } = {}) {
  let out = String(value ?? '');
  if (trim) out = out.trim();
  return out.slice(0, maxLength);
}

/** Normalize a timestamp (Date | number | string) to a number of milliseconds. */
export function toMs(value) {
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : Date.now();
}

/** Parse a route param into a positive integer id, or return null. */
export function parseId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Stable client fingerprint for rate limiting — CF-provided IP when present. */
export function clientKey(request) {
  const ip = request.cf && request.cf.ip;
  if (ip && ip !== '127.0.0.1' && ip !== '::1') return ip;
  const fwd = request.headers.get('cf-connecting-ip');
  return fwd || 'local';
}
