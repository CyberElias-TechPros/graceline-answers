'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const COOKIE = 'sc_auth';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const WEAK_SECRETS = new Set(['', 'change_me_to_a_long_random_string', 'dev-insecure-secret-change-me']);

const envSecret = (process.env.JWT_SECRET || '').trim();
const isProduction = process.env.NODE_ENV === 'production';

let SECRET;
if (envSecret && envSecret.length >= 32 && !WEAK_SECRETS.has(envSecret)) {
  SECRET = envSecret;
} else if (isProduction) {
  // Fail fast: never silently run production with a guessable signing key.
  throw new Error(
    '[graceline-answers] JWT_SECRET is missing or too weak. Set a strong JWT_SECRET ' +
      '(>= 32 chars) in your environment before starting in production.',
  );
} else {
  // Development fallback: random per-process key so dev sessions don't persist
  // across restart and there is no hardcoded secret in the repo.
  SECRET = crypto.randomBytes(48).toString('hex');
  console.warn(
    '[graceline-answers] JWT_SECRET not set; using a volatile dev secret. ' +
      'Set JWT_SECRET for real sessions.',
  );
}

function signUser(user) {
  return jwt.sign({ uid: user.id, role: user.role, email: user.email }, SECRET, {
    expiresIn: '30d',
  });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: TOKEN_TTL_MS,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readUser(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(payload.uid);
    return user || null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

/** Allow only users whose role is in `roles`. Must be used after requireAuth. */
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

function login(email, password) {
  const row = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(String(email || '').trim().toLowerCase());
  if (!row) return null;
  const ok = bcrypt.compareSync(String(password || ''), row.password_hash);
  if (!ok) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

module.exports = {
  signUser,
  setAuthCookie,
  clearAuthCookie,
  readUser,
  requireAuth,
  requireRole,
  login,
  TOKEN_TTL_MS,
};
