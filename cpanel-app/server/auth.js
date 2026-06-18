const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const COOKIE = 'sc_auth';

function signUser(user) {
  return jwt.sign({ uid: user.id, role: user.role, email: user.email }, SECRET, {
    expiresIn: '30d',
  });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
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

async function login(email, password) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!row) return null;
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

module.exports = { signUser, setAuthCookie, clearAuthCookie, readUser, requireAuth, login };
