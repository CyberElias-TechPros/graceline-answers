'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth, readUser } = require('../auth');
const { sendMail } = require('../mailer');
const { clampString, parseId } = require('../util');

const router = express.Router();
const seekerLimiter = rateLimit({ windowMs: 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false });

// Seeker posts a follow-up message (auth = tracking token).
router.post('/seeker', seekerLimiter, (req, res) => {
  const { token, content } = req.body || {};
  if (!token || !content) return res.status(400).json({ error: 'missing_fields' });
  const q = db.prepare('SELECT id, seeker_email FROM questions WHERE tracking_token = ?').get(token);
  if (!q) return res.status(404).json({ error: 'not_found' });

  const text = clampString(content, 4000);
  if (!text) return res.status(400).json({ error: 'empty' });
  if (text.length < 2) return res.status(400).json({ error: 'too_short' });

  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO messages (question_id, sender_type, content, created_at)
       VALUES (?, 'seeker', ?, ?)`,
    )
    .run(q.id, text, now);
  db.prepare('UPDATE questions SET status = ?, updated_at = ? WHERE id = ?').run('active', now, q.id);
  res.status(201).json({ id: info.lastInsertRowid });
});

// Counselor posts a reply (auth = JWT cookie).
router.post('/counselor', requireAuth, (req, res) => {
  const { question_id, content } = req.body || {};
  const qid = parseId(question_id);
  if (qid === null) return res.status(400).json({ error: 'bad_id' });
  const q = db.prepare('SELECT id, tracking_token, seeker_email FROM questions WHERE id = ?').get(qid);
  if (!q) return res.status(404).json({ error: 'not_found' });

  const text = clampString(content, 8000);
  if (!text) return res.status(400).json({ error: 'bad_content' });
  if (text.length < 2) return res.status(400).json({ error: 'too_short' });

  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO messages (question_id, sender_type, sender_user_id, content, created_at)
       VALUES (?, 'counselor', ?, ?, ?)`,
    )
    .run(q.id, req.user.id, text, now);
  db.prepare('UPDATE questions SET status = ?, updated_at = ? WHERE id = ?').run('active', now, q.id);

  if (q.seeker_email) {
    const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    sendMail({
      to: q.seeker_email,
      subject: '[GraceLine Answers] You have a new response',
      text: `A counselor has replied to your question.\n\nView the conversation: ${base}/t/${q.tracking_token}`,
    });
  }
  res.status(201).json({ id: info.lastInsertRowid, sender_name: req.user.name || null });
});

// Poll endpoint — returns messages newer than ?since= (id watermark).
router.get('/poll', (req, res) => {
  const { token, question_id, since } = req.query;
  const sinceId = Number(since) || 0;
  let qid = null;
  if (token) {
    const q = db.prepare('SELECT id FROM questions WHERE tracking_token = ?').get(token);
    qid = q && q.id;
  } else if (question_id) {
    const user = readUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    qid = parseId(question_id);
    if (qid === null) return res.status(400).json({ error: 'bad_id' });
    const q = db.prepare('SELECT id FROM questions WHERE id = ?').get(qid);
    if (!q) return res.status(404).json({ error: 'not_found' });
  } else {
    return res.status(400).json({ error: 'missing_target' });
  }
  if (!qid) return res.status(404).json({ error: 'not_found' });

  // Seekers (token path) see the counselor's name; the counselor console uses
  // the full thread endpoint for richer detail.
  const rows = db
    .prepare(
      `SELECT m.id, m.sender_type, m.content, m.created_at,
              CASE WHEN m.sender_type = 'counselor' THEN u.name ELSE NULL END AS sender_name
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_user_id
       WHERE m.question_id = ? AND m.id > ? ORDER BY m.id ASC`,
    )
    .all(qid, sinceId);
  res.json({ messages: rows });
});

module.exports = router;
