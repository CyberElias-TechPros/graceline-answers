const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT id, title, content, anonymous, prayed_count, created_at FROM prayer_requests ORDER BY created_at DESC LIMIT 100')
    .all();
  res.json({ items: rows });
});

router.post('/', (req, res) => {
  const { title, content } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: 'missing' });
  if (title.length > 200 || content.length > 4000) return res.status(400).json({ error: 'too_long' });
  const info = db
    .prepare('INSERT INTO prayer_requests (title, content, anonymous, created_at) VALUES (?, ?, 1, ?)')
    .run(String(title).trim(), String(content).trim(), Date.now());
  res.json({ id: info.lastInsertRowid });
});

router.post('/:id/pray', (req, res) => {
  db.prepare('UPDATE prayer_requests SET prayed_count = prayed_count + 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
