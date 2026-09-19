/**
 * Authentication for the Cloudflare Worker (no Node modules — WebCrypto only).
 *
 *  - Passwords: PBKDF2-SHA256, 310k iterations, 16-byte salt (stored as
 *    `pbkdf2$iterations$saltB64url$hashB64url`).
 *  - Sessions: HS256 JWT in an httpOnly `sc_auth` cookie (30 days), verified
 *    with a constant-time signature comparison.
 *  - The cPanel backend uses bcrypt + jsonwebtoken; this file produces an
 *    equivalent user contract ({ id, email, name, role }) on both.
 */
import { randomToken } from './util.js';

const COOKIE = 'sc_auth';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PBKDF2_ITERATIONS = 310000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64url(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(obj) {
  return toB64url(enc.encode(JSON.stringify(obj)));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256(key, data) {
  const k = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', k, data);
}

// ---------------------------------------------------------------- password --

export async function hashPassword(plain) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64url(salt)}$${toB64url(bits)}`;
}

export async function verifyPassword(plain, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  let salt, expected;
  try {
    salt = fromB64url(parts[2]);
    expected = fromB64url(parts[3]);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return constantTimeEqual(toB64url(bits), toB64url(expected));
}

// -------------------------------------------------------------------- jwt --

export function getSecret(env) {
  const secret = (env.JWT_SECRET || '').trim();
  if (secret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or too weak (>= 32 chars). Set it with ' +
        '`wrangler secret put JWT_SECRET` (locally: .dev.vars).',
    );
  }
  return enc.encode(secret);
}

export async function signUser(user, env) {
  const secret = getSecret(env);
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const now = Date.now();
  const payload = b64urlJson({
    uid: user.id,
    role: user.role,
    email: user.email,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + TOKEN_TTL_MS) / 1000),
  });
  const sig = toB64url(await hmacSha256(secret, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${sig}`;
}

export async function verifyToken(token, env) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  try {
    const secret = getSecret(env);
    const expected = toB64url(await hmacSha256(secret, enc.encode(`${header}.${payload}`)));
    if (!constantTimeEqual(sig, expected)) return null;
    const data = JSON.parse(dec.decode(fromB64url(payload)));
    if (!data || !data.exp || data.exp * 1000 < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- cookies --

export function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) {
      const k = part.slice(0, i).trim();
      let v = part.slice(i + 1).trim();
      try {
        v = decodeURIComponent(v);
      } catch {
        /* keep raw */
      }
      out[k] = v;
    }
  }
  return out;
}

export function isSecure(request) {
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function setAuthCookieHeader(request, token) {
  const secure = isSecure(request) ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
    TOKEN_TTL_MS / 1000,
  )}${secure}`;
}

export function clearAuthCookieHeader() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Resolve the authenticated user (or null) for a request. */
export async function readUser(request, env, db) {
  const cookies = parseCookies(request);
  const token = cookies[COOKIE];
  if (!token) return null;
  const payload = await verifyToken(token, env);
  if (!payload || !payload.uid) return null;
  const row = await db
    .prepare('SELECT id, email, name, role FROM users WHERE id = ?')
    .bind(payload.uid)
    .first();
  return row || null;
}

// ------------------------------------------------------------------ login --

export async function loginUser(email, password, env, db) {
  const row = await db
    .prepare('SELECT * FROM users WHERE email = ?')
    .bind(String(email || '').trim().toLowerCase())
    .first();
  if (!row) {
    // Burn roughly the same time as a real check to blunt timing differences.
    await hashPassword(password || '');
    return null;
  }
  const ok = await verifyPassword(password || '', row.password_hash);
  if (!ok) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export { COOKIE as AUTH_COOKIE, TOKEN_TTL_MS };
export { randomToken };
