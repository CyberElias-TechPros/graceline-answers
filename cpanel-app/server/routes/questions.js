const express = require('express');
const { nanoid } = require('nanoid');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { detectCrisis } = require('../crisis');
const { sendMail } = require('../mailer');

const router = express.Router();

const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });

// Submit a new question (anonymous or with email)
router.post('/', submitLimiter, async (req, res) => {
  const { title, content, category, email } = req.body || {};
  if (!title || !content || String(title).length < 3 || String(content).length < 10) {
    return res.status(400).json({ error: 'Please write a clear title and a longer question.' });
  }
  if (String(title).length > 200 || String(content).length > 8000) {
    return res.status(400).json({ error: 'Your message is too long.' });
  }

  const crisis = detectCrisis(`${title}\n${content}`);
  const token = nanoid(24);
  const now = Date.now();

  // Privacy: deliberately do NOT store IP, user-agent, fingerprint, or anything
  // beyond what the seeker typed.
  const info = db
    .prepare(
      `INSERT INTO questions
       (tracking_token, seeker_email, category, raw_title, raw_content,
        is_urgent, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)`
    )
    .run(
      token,
      email ? String(email).trim().slice(0, 255) : null,
      category ? String(category).slice(0, 50) : null,
      String(title).trim(),
      String(content).trim(),
      crisis.isCrisis ? 1 : 0,
      now, now
    );

  // Notify counselor pool via the bootstrap admin email
  const admin = db.prepare("SELECT email FROM users WHERE role IN ('admin','counselor') LIMIT 1").get();
  if (admin) {
    const base = process.env.PUBLIC_BASE_URL || '';
    sendMail({
      to: admin.email,
      subject: `[SoulConnect] New question${crisis.isCrisis ? ' — URGENT' : ''}`,
      text: `A new question was submitted.\n\nCategory: ${category || '—'}\nTitle: ${title}\n\nOpen the inbox: ${base}/admin/inbox`,
    });
  }

  res.json({
    id: info.lastInsertRowid,
    tracking_token: token,
    crisis,
  });
});

// Fetch a seeker's thread by tracking token
router.get('/by-token/:token', (req, res) => {
  const q = db
    .prepare(
      `SELECT id, tracking_token, category, raw_title AS title, raw_content AS content,
              is_urgent, status, created_at
       FROM questions WHERE tracking_token = ?`
    )
    .get(req.params.token);
  if (!q) return res.status(404).json({ error: 'not_found' });
  const messages = db
    .prepare(
      `SELECT id, sender_type, content, created_at FROM messages
       WHERE question_id = ? ORDER BY id ASC`
    )
    .all(q.id);
  const crisis = detectCrisis(`${q.title}\n${q.content}`);
  res.json({ question: q, messages, crisis });
});

module.exports = router;
