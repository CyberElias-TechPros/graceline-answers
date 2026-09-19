'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { detectCrisis } = require('../crisis');
const { sendMail } = require('../mailer');
const { randomToken, clampString } = require('../util');

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again later.' },
  // Skip limiter for test/CI so automated tests aren't throttled.
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Notify the counselor pool that a new question arrived. Sends to every
 * counselor/admin account (a small, curated group), so the burden is shared.
 */
function notifyCounselors({ title, category, isCrisis, trackingToken }) {
  const rows = db
    .prepare("SELECT email FROM users WHERE role IN ('admin','counselor') ORDER BY id ASC")
    .all();
  if (!rows.length) return;
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const subject = `[GraceLine Answers] New question${isCrisis ? ' — URGENT' : ''}`;
  const text =
    `A new question was submitted.\n\n` +
    `Category: ${category || '—'}\n` +
    `Title: ${title}\n\n` +
    `Open the inbox: ${base}/admin/inbox\n` +
    (trackingToken ? `Private thread link: ${base}/t/${trackingToken}\n` : '');
  for (const row of rows) {
    sendMail({ to: row.email, subject, text });
  }
}

// Submit a new question (anonymous or with email).
router.post('/', submitLimiter, (req, res) => {
  const title = clampString(req.body?.title, 200);
  const content = clampString(req.body?.content, 8000);
  const category = clampString(req.body?.category, 50);
  const email = req.body?.email ? String(req.body.email).trim().slice(0, 255) : null;

  if (!title || !content) {
    return res.status(400).json({ error: 'Please write a clear title and a longer question.' });
  }
  if (title.length < 3) {
    return res.status(400).json({ error: 'Please write a title of at least 3 characters.' });
  }
  if (content.length < 10) {
    return res.status(400).json({ error: 'Please write a question of at least 10 characters.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const crisis = detectCrisis(`${title}\n${content}`);
  const token = randomToken(18);
  const now = Date.now();

  // Privacy: deliberately do NOT store IP, user-agent, fingerprint, or anything
  // beyond what the seeker typed.
  const info = db
    .prepare(
      `INSERT INTO questions
       (tracking_token, seeker_email, category, raw_title, raw_content,
        is_urgent, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
    )
    .run(token, email, category || null, title, content, crisis.isCrisis ? 1 : 0, now, now);

  notifyCounselors({
    title,
    category,
    isCrisis: crisis.isCrisis,
    trackingToken: token,
  });

  res.status(201).json({
    id: info.lastInsertRowid,
    tracking_token: token,
    crisis,
  });
});

// Fetch a seeker's thread by tracking token.
router.get('/by-token/:token', (req, res) => {
  const q = db
    .prepare(
      `SELECT id, tracking_token, category, raw_title AS title, raw_content AS content,
              is_urgent, status, created_at, updated_at
       FROM questions WHERE tracking_token = ?`,
    )
    .get(req.params.token);
  if (!q) return res.status(404).json({ error: 'not_found' });
  const messages = db
    .prepare(
      `SELECT m.id, m.sender_type, m.content, m.created_at,
              CASE WHEN m.sender_type = 'counselor' THEN u.name ELSE NULL END AS sender_name
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_user_id
       WHERE m.question_id = ? ORDER BY m.id ASC`,
    )
    .all(q.id);
  const crisis = detectCrisis(`${q.title}\n${q.content}`);
  res.json({ question: q, messages, crisis });
});

module.exports = router;
