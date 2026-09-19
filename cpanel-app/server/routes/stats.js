'use strict';

/**
 * Public, aggregate-only stats for the marketing pages (same contract as the
 * Cloudflare Worker's GET /api/stats). No PII, no per-question data.
 */
const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const row = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM questions) AS questions_total,
        (SELECT COUNT(*) FROM questions WHERE is_public = 1) AS published_total,
        (SELECT COUNT(*) FROM questions WHERE status IN ('active','resolved')) AS answered_total,
        (SELECT COUNT(*) FROM prayer_requests) AS prayer_total,
        (SELECT COALESCE(SUM(prayed_count), 0) FROM prayer_requests) AS prayers_total,
        (SELECT COUNT(*) FROM users WHERE role IN ('admin','counselor')) AS counselor_total`,
    )
    .get();
  res.json(row);
});

module.exports = router;
