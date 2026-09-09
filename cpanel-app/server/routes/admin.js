'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const db = require('../db');
const {
  requireAuth,
  requireRole,
  login,
  signUser,
  setAuthCookie,
  clearAuthCookie,
  readUser,
} = require('../auth');
const { clampString, parseId } = require('../util');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  // Skip limiter for test/CI so automated tests aren't throttled.
  skip: () => process.env.NODE_ENV === 'test',
});

const ROLES = ['admin', 'counselor'];

router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing' });
  // Always return the same generic message to avoid account enumeration.
  const user = login(email, password);
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  setAuthCookie(res, signUser(user));
  res.json({ user });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const user = readUser(req);
  res.json({ user });
});

// Everything below requires authentication.
router.use(requireAuth);

// Inbox listing
router.get('/questions', (req, res) => {
  const { status = 'new' } = req.query;
  const allowed = ['new', 'active', 'resolved'];
  const st = allowed.includes(status) ? status : 'new';
  const rows = db
    .prepare(
      `SELECT id, tracking_token, raw_title AS title, category, is_urgent,
              status, seeker_email, created_at, updated_at
       FROM questions WHERE status = ?
       ORDER BY is_urgent DESC, updated_at DESC LIMIT 200`,
    )
    .all(st);
  res.json({ items: rows });
});

// Full thread (raw content visible to counselor)
router.get('/questions/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'bad_id' });
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  if (!q) return res.status(404).json({ error: 'not_found' });
  const messages = db.prepare('SELECT * FROM messages WHERE question_id = ? ORDER BY id ASC').all(q.id);
  const notes = db
    .prepare(
      `SELECT n.*, u.name AS author_name FROM internal_notes n
       LEFT JOIN users u ON u.id = n.author_id
       WHERE n.question_id = ? ORDER BY n.id ASC`,
    )
    .all(q.id);
  res.json({ question: q, messages, notes });
});

router.post('/questions/:id/note', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'bad_id' });
  const content = clampString(req.body?.content, 8000);
  if (!content) return res.status(400).json({ error: 'empty' });
  const q = db.prepare('SELECT id FROM questions WHERE id = ?').get(id);
  if (!q) return res.status(404).json({ error: 'not_found' });
  db.prepare(
    `INSERT INTO internal_notes (question_id, author_id, content, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(id, req.user.id, content, Date.now());
  res.status(201).json({ ok: true });
});

router.post('/questions/:id/status', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'bad_id' });
  const { status } = req.body || {};
  if (!['new', 'active', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'bad_status' });
  }
  const changed = db
    .prepare('UPDATE questions SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id);
  if (!changed.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// Sanitize + publish to archive.
router.post('/questions/:id/publish', (req, res) => {
  const { public_title, public_content, public_answer, category, is_public } = req.body || {};
  const pt = clampString(public_title, 300);
  const pc = clampString(public_content, 12000);
  const pa = clampString(public_answer, 20000);
  const cat = clampString(category, 50) || null;

  if (is_public && (!pt || !pc || !pa)) {
    return res.status(400).json({ error: 'sanitized_fields_required' });
  }

  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'bad_id' });
  const question = db.prepare('SELECT id FROM questions WHERE id = ?').get(id);
  if (!question) return res.status(404).json({ error: 'not_found' });

  db.prepare(
    `UPDATE questions SET public_title = ?, public_content = ?, public_answer = ?,
       category = COALESCE(?, category), is_public = ?, updated_at = ? WHERE id = ?`,
  ).run(pt || null, pc || null, pa || null, cat, is_public ? 1 : 0, Date.now(), id);

  // Sync FTS (contentless table: delete + insert index).
  db.prepare('DELETE FROM archive_fts WHERE rowid = ?').run(id);
  if (is_public) {
    db.prepare(
      `INSERT INTO archive_fts (rowid, public_title, public_content, public_answer, category)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, pt || '', pc || '', pa || '', cat || '');
  }
  res.json({ ok: true, published: !!is_public });
});

router.get('/stats', (req, res) => {
  const row = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM questions WHERE status='new') AS new_count,
        (SELECT COUNT(*) FROM questions WHERE status='active') AS active_count,
        (SELECT COUNT(*) FROM questions WHERE is_urgent=1 AND status<>'resolved') AS urgent_count,
        (SELECT COUNT(*) FROM questions WHERE is_public=1) AS public_count,
        (SELECT COUNT(*) FROM users WHERE role IN ('admin','counselor')) AS counselor_count`,
    )
    .get();
  res.json(row);
});

/* ------------------------------------------------------------------ *
 * Team management (admin-only). A counseling ministry needs more than
 * one counselor; without this there is no way to add them.
 * ------------------------------------------------------------------ */

router.use('/team', requireRole(['admin']));

router.get('/team', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, email, name, role, created_at FROM users
       ORDER BY role ASC, created_at ASC`,
    )
    .all();
  res.json({ items: rows });
});

router.post('/team', (req, res) => {
  const email = clampString(req.body?.email, 255).toLowerCase();
  const name = clampString(req.body?.name, 120);
  const password = req.body?.password ? String(req.body.password) : '';
  const role = req.body?.role && ROLES.includes(req.body.role) ? req.body.role : 'counselor';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'password_too_short' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'email_exists' });

  const info = db
    .prepare(
      'INSERT INTO users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(email, bcrypt.hashSync(password, 12), name || null, role, Date.now());
  res.status(201).json({ id: info.lastInsertRowid, email, name: name || null, role });
});

router.post('/team/:id/password', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'bad_id' });
  const password = req.body?.password ? String(req.body.password) : '';
  if (password.length < 10) return res.status(400).json({ error: 'password_too_short' });
  const changed = db
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(password, 12), id);
  if (!changed.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

router.delete('/team/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'bad_id' });
  if (id === req.user.id) return res.status(400).json({ error: 'cannot_delete_self' });
  // Never remove the last admin.
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get();
    if (admins && admins.c <= 1) return res.status(400).json({ error: 'cannot_delete_last_admin' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
