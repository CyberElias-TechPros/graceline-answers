const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { readUser } = require('../auth');
const { sendMail } = require('../mailer');

const router = express.Router();
const msgLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

// Seeker posts a follow-up message (auth = tracking token)
router.post('/seeker', msgLimiter, (req, res) => {
  const { token, content } = req.body || {};
  if (!token || !content) return res.status(400).json({ error: 'missing_fields' });
  const q = db.prepare('SELECT id, seeker_email FROM questions WHERE tracking_token = ?').get(token);
  if (!q) return res.status(404).json({ error: 'not_found' });
  if (String(content).length > 4000) return res.status(400).json({ error: 'too_long' });
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO messages (question_id, sender_type, content, created_at)
       VALUES (?, 'seeker', ?, ?)`
    )
    .run(q.id, String(content).trim(), now);
  db.prepare('UPDATE questions SET status = ?, updated_at = ? WHERE id = ?')
    .run('active', now, q.id);
  res.json({ id: info.lastInsertRowid });
});

// Counselor posts a reply (auth = JWT cookie)
router.post('/counselor', (req, res) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  const { question_id, content } = req.body || {};
  const q = db.prepare('SELECT id, tracking_token, seeker_email FROM questions WHERE id = ?').get(question_id);
  if (!q) return res.status(404).json({ error: 'not_found' });
  if (!content || String(content).length > 8000) return res.status(400).json({ error: 'bad_content' });
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO messages (question_id, sender_type, sender_user_id, content, created_at)
       VALUES (?, 'counselor', ?, ?, ?)`
    )
    .run(q.id, user.id, String(content).trim(), now);
  db.prepare('UPDATE questions SET status = ?, updated_at = ? WHERE id = ?')
    .run('active', now, q.id);

  if (q.seeker_email) {
    const base = process.env.PUBLIC_BASE_URL || '';
    sendMail({
      to: q.seeker_email,
      subject: '[SoulConnect] You have a new response',
      text: `A counselor has replied to your question.\n\nView the conversation: ${base}/t/${q.tracking_token}`,
    });
  }
  res.json({ id: info.lastInsertRowid });
});

// Poll endpoint — returns messages newer than ?since=
router.get('/poll', (req, res) => {
  const { token, question_id, since } = req.query;
  const sinceId = Number(since || 0);
  let qid = null;
  if (token) {
    const q = db.prepare('SELECT id FROM questions WHERE tracking_token = ?').get(token);
    qid = q?.id;
  } else if (question_id) {
    const user = readUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    qid = Number(question_id);
  }
  if (!qid) return res.status(400).json({ error: 'missing_target' });
  const rows = db
    .prepare(
      `SELECT id, sender_type, content, created_at FROM messages
       WHERE question_id = ? AND id > ? ORDER BY id ASC`
    )
    .all(qid, sinceId);
  res.json({ messages: rows });
});

module.exports = router;
