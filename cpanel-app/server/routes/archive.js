'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

const CATEGORIES = [
  'Bible Interpretation',
  'Salvation',
  'Prayer',
  'Marriage',
  'Parenting',
  'Youth',
  'Anxiety',
  'Depression',
  'Faith Crisis',
  'Career',
  'Other',
];

/**
 * Build a safe FTS5 MATCH expression from a free-text search.
 *
 * FTS5 chokes on characters like `+`, `-`, `~`, `^`, `:`, parentheses, etc. To
 * avoid both syntax errors and undesirable operator semantics we extract only
 * alphanumeric word tokens and quote each one. Words joined by a space are ANDed
 * (FTS5 default), which gives predictable "contains all these words" behaviour with
 * the porter stemmer handling plurals/inflections.
 */
function buildFtsMatch(rawQuery) {
  const words = String(rawQuery || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  if (!words.length) return null;
  return words.map((w) => `"${w}"`).join(' ');
}

// List/search published archive entries.
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const category = (req.query.category || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  // For pagination UI, fetch one extra row to detect "has more".
  const fetchLimit = limit + 1;

  let items;
  let base = `SELECT id, public_title AS title, public_content AS content,
              public_answer AS answer, category, created_at FROM questions`;

  if (q && buildFtsMatch(q)) {
    const term = buildFtsMatch(q);
    items = db
      .prepare(
        `SELECT q.id, q.public_title AS title, q.public_content AS content,
                q.public_answer AS answer, q.category, q.created_at
         FROM archive_fts
         JOIN questions q ON q.id = archive_fts.rowid
         WHERE archive_fts MATCH ? AND q.is_public = 1
         ORDER BY q.created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(term, fetchLimit, offset);
  } else {
    const where = [];
    const params = [];
    if (category && CATEGORIES.includes(category)) {
      where.push('category = ?');
      params.push(category);
    }
    const sql = `${base} ${where.length ? `WHERE ${where.join(' AND ')} AND is_public = 1` : 'WHERE is_public = 1'}
      ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    items = db.prepare(sql).all(...params, fetchLimit, offset);
  }

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  res.json({
    items: pageItems,
    hasMore,
    limit,
    offset,
    nextOffset: hasMore ? offset + limit : null,
  });
});

router.get('/categories', (req, res) => {
  res.json({ categories: CATEGORIES });
});

router.get('/:id', (req, res) => {
  const row = db
    .prepare(
      `SELECT id, public_title AS title, public_content AS content,
              public_answer AS answer, category, created_at
       FROM questions WHERE id = ? AND is_public = 1`,
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

module.exports = router;
