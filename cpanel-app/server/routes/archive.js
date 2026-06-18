const express = require('express');
const db = require('../db');

const router = express.Router();

// List published archive entries
router.get('/', (req, res) => {
  const { q, category, limit = 30, offset = 0 } = req.query;
  const lim = Math.min(Number(limit) || 30, 100);
  const off = Number(offset) || 0;

  if (q && String(q).trim()) {
    // FTS search across public fields
    const term = String(q).trim().replace(/['"]/g, '') + '*';
    const rows = db
      .prepare(
        `SELECT q.id, q.public_title AS title, q.public_content AS content,
                q.public_answer AS answer, q.category, q.created_at
         FROM archive_fts f
         JOIN questions q ON q.id = f.rowid
         WHERE archive_fts MATCH ? AND q.is_public = 1
         ORDER BY q.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(term, lim, off);
    return res.json({ items: rows });
  }

  const params = [];
  let where = 'WHERE is_public = 1';
  if (category) { where += ' AND category = ?'; params.push(category); }
  const rows = db
    .prepare(
      `SELECT id, public_title AS title, public_content AS content,
              public_answer AS answer, category, created_at
       FROM questions ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, lim, off);
  res.json({ items: rows });
});

router.get('/:id', (req, res) => {
  const row = db
    .prepare(
      `SELECT id, public_title AS title, public_content AS content,
              public_answer AS answer, category, created_at
       FROM questions WHERE id = ? AND is_public = 1`
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

module.exports = router;
