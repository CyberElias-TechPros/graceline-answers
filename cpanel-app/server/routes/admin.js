const express = require('express');
const db = require('../db');
const { requireAuth, login, signUser, setAuthCookie, clearAuthCookie, readUser } = require('../auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing' });
  const user = await login(email, password);
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

router.use(requireAuth);

// Inbox listing
router.get('/questions', (req, res) => {
  const { status = 'new' } = req.query;
  const rows = db
    .prepare(
      `SELECT id, tracking_token, raw_title AS title, category, is_urgent,
              status, seeker_email, created_at, updated_at
       FROM questions WHERE status = ? ORDER BY is_urgent DESC, updated_at DESC LIMIT 200`
    )
    .all(status);
  res.json({ items: rows });
});

// Full thread (raw content visible to counselor)
router.get('/questions/:id', (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'not_found' });
  const messages = db
    .prepare('SELECT * FROM messages WHERE question_id = ? ORDER BY id ASC')
    .all(q.id);
  const notes = db
    .prepare(
      `SELECT n.*, u.name AS author_name FROM internal_notes n
       LEFT JOIN users u ON u.id = n.author_id
       WHERE n.question_id = ? ORDER BY n.id ASC`
    )
    .all(q.id);
  res.json({ question: q, messages, notes });
});

router.post('/questions/:id/note', (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'empty' });
  db.prepare(
    `INSERT INTO internal_notes (question_id, author_id, content, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(req.params.id, req.user.id, String(content).trim(), Date.now());
  res.json({ ok: true });
});

router.post('/questions/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'active', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'bad_status' });
  }
  db.prepare('UPDATE questions SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), req.params.id);
  res.json({ ok: true });
});

// Sanitize + publish to archive
router.post('/questions/:id/publish', (req, res) => {
  const { public_title, public_content, public_answer, category, is_public } = req.body || {};
  if (is_public && (!public_title || !public_content || !public_answer)) {
    return res.status(400).json({ error: 'sanitized_fields_required' });
  }
  const id = Number(req.params.id);
  db.prepare(
    `UPDATE questions SET public_title = ?, public_content = ?, public_answer = ?,
       category = COALESCE(?, category), is_public = ?, updated_at = ? WHERE id = ?`
  ).run(
    public_title || null,
    public_content || null,
    public_answer || null,
    category || null,
    is_public ? 1 : 0,
    Date.now(),
    id
  );
  // Sync FTS
  db.prepare('DELETE FROM archive_fts WHERE rowid = ?').run(id);
  if (is_public) {
    db.prepare(
      `INSERT INTO archive_fts (rowid, public_title, public_content, public_answer, category)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, public_title || '', public_content || '', public_answer || '', category || '');
  }
  res.json({ ok: true });
});

router.get('/stats', (req, res) => {
  const row = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM questions WHERE status='new') AS new_count,
        (SELECT COUNT(*) FROM questions WHERE status='active') AS active_count,
        (SELECT COUNT(*) FROM questions WHERE is_urgent=1 AND status<>'resolved') AS urgent_count,
        (SELECT COUNT(*) FROM questions WHERE is_public=1) AS public_count`
    )
    .get();
  res.json(row);
});

module.exports = router;
