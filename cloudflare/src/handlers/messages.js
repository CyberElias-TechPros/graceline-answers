/**
 * Thread messaging:
 *
 *   POST /api/messages/seeker     seeker follow-up (auth = tracking token)
 *   POST /api/messages/counselor  counselor reply   (auth = JWT cookie)
 *   GET  /api/messages/poll       new messages since ?since=<id> (watermark)
 */
import { json, error, readJson } from '../respond.js';
import { clampString, parseId, clientKey } from '../util.js';
import { first, run } from '../db.js';
import { readUser } from '../auth.js';
import { rateLimit, rateLimitKey } from '../rate-limit.js';
import { sendMail } from '../mail.js';
import { siteConfig } from '../config.js';

const SEEKER_MSG_SQL =
  "SELECT id, sender_type, content, created_at FROM messages WHERE question_id = ? AND id > ? ORDER BY id ASC";
const NAMED_MSG_SQL =
  `SELECT m.id, m.sender_type, m.content, m.created_at,
          CASE WHEN m.sender_type = 'counselor' THEN u.name ELSE NULL END AS sender_name
   FROM messages m LEFT JOIN users u ON u.id = m.sender_user_id
   WHERE m.question_id = ? AND m.id > ? ORDER BY m.id ASC`;

export async function handleMessages(request, env, db, url) {
  const path = url.pathname;

  if (request.method === 'POST' && path === '/api/messages/seeker') {
    const body = (await readJson(request)) || {};
    const { token, content } = body;
    if (!token || !content) return error('missing_fields');
    const rl = await rateLimit(env, rateLimitKey('seeker-msg', '1m'), String(token), 12);
    if (rl.limited) return error('Too many messages. Please slow down.', 429);

    const q = await first(
      db,
      'SELECT id, seeker_email FROM questions WHERE tracking_token = ?',
      [String(token)],
    );
    if (!q) return error('not_found', 404);

    const text = clampString(content, 4000);
    if (!text) return error('empty');
    if (text.length < 2) return error('too_short');

    const now = Date.now();
    const info = await run(
      db,
      `INSERT INTO messages (question_id, sender_type, content, created_at)
       VALUES (?, 'seeker', ?, ?)`,
      [q.id, text, now],
    );
    await run(db, "UPDATE questions SET status = 'active', updated_at = ? WHERE id = ?", [
      now,
      q.id,
    ]);
    return json({ id: info.lastRowId }, { status: 201 });
  }

  if (request.method === 'POST' && path === '/api/messages/counselor') {
    const user = await readUser(request, env, db);
    if (!user) return error('unauthorized', 401);
    const rl = await rateLimit(env, rateLimitKey('counselor-msg', '1m'), `user:${user.id}`, 30);
    if (rl.limited) return error('Too many messages. Please slow down.', 429);

    const body = (await readJson(request)) || {};
    const qid = parseId(body.question_id);
    if (qid === null) return error('bad_id');
    const q = await first(
      db,
      'SELECT id, tracking_token, seeker_email FROM questions WHERE id = ?',
      [qid],
    );
    if (!q) return error('not_found', 404);

    const text = clampString(body.content, 8000);
    if (!text) return error('bad_content');
    if (text.length < 2) return error('too_short');

    const now = Date.now();
    const info = await run(
      db,
      `INSERT INTO messages (question_id, sender_type, sender_user_id, content, created_at)
       VALUES (?, 'counselor', ?, ?, ?)`,
      [q.id, user.id, text, now],
    );
    await run(db, "UPDATE questions SET status = 'active', updated_at = ? WHERE id = ?", [
      now,
      q.id,
    ]);

    if (q.seeker_email) {
      const cfg = siteConfig(env);
      const base = cfg.publicBase || new URL(request.url).origin;
      await sendMail(env, {
        to: q.seeker_email,
        subject: '[GraceLine Answers] You have a new response',
        text: `A counselor has replied to your question.\n\nView the conversation: ${base}/t/${q.tracking_token}`,
      });
    }
    return json(
      { id: info.lastRowId, sender_name: user.name || null },
      { status: 201 },
    );
  }

  if (request.method === 'GET' && path === '/api/messages/poll') {
    const token = url.searchParams.get('token');
    const questionId = url.searchParams.get('question_id');
    const since = Number(url.searchParams.get('since')) || 0;

    let qid = null;
    if (token) {
      const q = await first(db, 'SELECT id FROM questions WHERE tracking_token = ?', [
        String(token),
      ]);
      qid = q ? q.id : null;
    } else if (questionId) {
      const user = await readUser(request, env, db);
      if (!user) return error('unauthorized', 401);
      qid = parseId(questionId);
      if (qid === null) return error('bad_id');
      const q = await first(db, 'SELECT id FROM questions WHERE id = ?', [qid]);
      if (!q) return error('not_found', 404);
    } else {
      return error('missing_target');
    }
    if (!qid) return error('not_found', 404);

    const rows = token
      ? (
          await db.prepare(NAMED_MSG_SQL).bind(qid, since).all()
        ).results
      : (await db.prepare(SEEKER_MSG_SQL).bind(qid, since).all()).results;
    return json({ messages: rows || [] });
  }

  return null;
}
