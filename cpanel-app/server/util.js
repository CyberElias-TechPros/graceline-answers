'use strict';

const crypto = require('crypto');

/**
 * Generate a URL-safe, cryptographically random token.
 *
 * We intentionally do not use `nanoid` here: v5+ is ESM-only and `require()`-ing it
 * fails on cPanel's Node 18/20 (which predate Node 22's `require(esm)` support).
 * `crypto.randomBytes` is available everywhere and is equally secure.
 *
 * @param {number} bytes Number of random bytes (default 18 => ~144 bits).
 * @returns {string} URL-safe base64 token (no padding, no +/).
 */
function randomToken(bytes = 18) {
  return crypto
    .randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Trim a string and clamp to a maximum length. */
function clampString(value, maxLength, { trim = true } = {}) {
  let out = String(value ?? '');
  if (trim) out = out.trim();
  return out.slice(0, maxLength);
}

/** Normalize a timestamp (Date | number | string) to a number of milliseconds. */
function toMs(value) {
  if (value instanceof Date) return value.getTime();
  return Number(value) || Date.now();
}

/**
 * Parse a route param into a positive integer id, or return null if it is not a valid
 * integer. Guards SQLite against NaN/string bindings that would otherwise throw.
 */
function parseId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

module.exports = { randomToken, clampString, toMs, parseId };
