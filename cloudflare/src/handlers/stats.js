/**
 * Public, aggregate-only stats for the marketing pages.
 * No PII, no per-question data — safe to expose anonymously.
 *
 *   GET /api/stats
 */
import { json } from '../respond.js';
import { first } from '../db.js';

export async function handleStats(request, env, db, url) {
  if (request.method !== 'GET' || url.pathname !== '/api/stats') return null;
  const row = (await first(
    db,
    `SELECT
      (SELECT COUNT(*) FROM questions) AS questions_total,
      (SELECT COUNT(*) FROM questions WHERE is_public = 1) AS published_total,
      (SELECT COUNT(*) FROM questions WHERE status IN ('active','resolved')) AS answered_total,
      (SELECT COUNT(*) FROM prayer_requests) AS prayer_total,
      (SELECT COALESCE(SUM(prayed_count), 0) FROM prayer_requests) AS prayers_total,
      (SELECT COUNT(*) FROM users WHERE role IN ('admin','counselor')) AS counselor_total`,
  )) || {};
  return json(row);
}
