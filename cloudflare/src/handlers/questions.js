/**
 * Question submission + seeker thread endpoints.
 *
 *   POST /api/questions              submit (anonymous or with email)
 *   GET  /api/questions/by-token/:t  seeker thread by tracking token
 *
 * Privacy: IP / user-agent / fingerprint are never stored for anonymous
 * submissions — deliberately.
 */
import { json, error, readJson } from '../respond.js';
import { clampString, randomToken, clientKey } from '../util.js';
import { detectCrisis } from '../crisis.js';
import { notifyCounselors } from '../mail.js';
import { first, run } from '../db.js';
import { rateLimit, rateLimitKey } from '../rate-limit.js';
import { siteConfig } from '../config.js';

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

export async function handleQuestions(request, env, db, url) {
  const path = url.pathname;

  if (request.method === 'POST' && path === '/api/questions') {
    const rl = await rateLimit(env, rateLimitKey('submit', '1h'), clientKey(request), 10);
    if (rl.limited) return error('Too many submissions. Please try again later.', 429);

    const body = (await readJson(request)) || {};
    const title = clampString(body.title, 200);
    const content = clampString(body.content, 8000);
    const category = clampString(body.category, 50);
    const email = body.email ? String(body.email).trim().slice(0, 255) : null;

    if (!title || !content) {
      return error('Please write a clear title and a longer question.');
    }
    if (title.length < 3) {
      return error('Please write a title of at least 3 characters.');
    }
    if (content.length < 10) {
      return error('Please write a question of at least 10 characters.');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return error('Please enter a valid email address.');
    }
    if (category && !CATEGORIES.includes(category)) {
      return error('Please choose a valid category.');
    }

    const crisis = detectCrisis(`${title}\n${content}`);
    const token = randomToken(18);
    const now = Date.now();

    const info = await run(
      db,
      `INSERT INTO questions
       (tracking_token, seeker_email, category, raw_title, raw_content,
        is_urgent, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
      [token, email, category || null, title, content, crisis.isCrisis ? 1 : 0, now, now],
    );

    const cfg = siteConfig(env);
    const base = cfg.publicBase || new URL(request.url).origin;
    await notifyCounselors(env, db, {
      title,
      category: category || null,
      isCrisis: crisis.isCrisis,
      trackingToken: token,
      base,
    });

    return json({ id: info.lastRowId, tracking_token: token, crisis }, { status: 201 });
  }

  const tokenMatch = path.match(/^\/api\/questions\/by-token\/([^/]+)$/);
  if (request.method === 'GET' && tokenMatch) {
    const q = await first(
      db,
      `SELECT id, tracking_token, category, raw_title AS title, raw_content AS content,
              is_urgent, status, created_at, updated_at
       FROM questions WHERE tracking_token = ?`,
      [decodeURIComponent(tokenMatch[1])],
    );
    if (!q) return error('not_found', 404);
    const messages = await firstAllMessages(db, q.id);
    const crisis = detectCrisis(`${q.title}\n${q.content}`);
    return json({ question: q, messages, crisis });
  }

  return null;
}

export async function firstAllMessages(db, questionId) {
  const r = await db
    .prepare(
      `SELECT m.id, m.sender_type, m.content, m.created_at,
              CASE WHEN m.sender_type = 'counselor' THEN u.name ELSE NULL END AS sender_name
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_user_id
       WHERE m.question_id = ?
       ORDER BY m.id ASC`,
    )
    .bind(questionId)
    .all();
  return r.results || [];
}

export { CATEGORIES };
