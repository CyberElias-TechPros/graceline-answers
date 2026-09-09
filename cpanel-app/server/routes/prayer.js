'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { clampString, parseId } = require('../util');

const router = express.Router();

const prayLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });

router.get('/', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const rows = db
    .prepare(
      'SELECT id, title, content, anonymous, prayed_count, created_at FROM prayer_requests ORDER BY created_at DESC LIMIT ?',
    )
    .all(limit);
  res.json({ items: rows });
});

router.post('/', submitLimiter, (req, res) => {
  const title = clampString(req.body?.title, 200);
  const content = clampString(req.body?.content, 4000);
  if (!title || !content) return res.status(400).json({ error: 'missing' });
  if (title.length < 2) return res.status(400).json({ error: 'too_short' });
  if (content.length < 5) return res.status(400).json({ error: 'too_short' });
  const info = db
    .prepare('INSERT INTO prayer_requests (title, content, anonymous, created_at) VALUES (?, ?, 1, ?)')
    .run(title, content, Date.now());
  res.status(201).json({ id: info.lastInsertRowid });
});

router.post('/:id/pray', prayLimiter, (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'bad_id' });
  const changed = db.prepare('UPDATE prayer_requests SET prayed_count = prayed_count + 1 WHERE id = ?').run(id);
  if (!changed.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

module.exports = router;
