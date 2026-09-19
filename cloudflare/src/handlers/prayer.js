/**
 * Community prayer wall (anonymous):
 *
 *   GET  /api/prayer          latest requests
 *   POST /api/prayer          post a request
 *   POST /api/prayer/:id/pray "I prayed" counter
 */
import { json, error, readJson } from '../respond.js';
import { clampString, parseId, clientKey } from '../util.js';
import { run } from '../db.js';
import { rateLimit, rateLimitKey } from '../rate-limit.js';

export async function handlePrayer(request, env, db, url) {
  const path = url.pathname;

  if (request.method === 'GET' && path === '/api/prayer') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
    const r = await db
      .prepare(
        'SELECT id, title, content, anonymous, prayed_count, created_at FROM prayer_requests ORDER BY created_at DESC LIMIT ?',
      )
      .bind(limit)
      .all();
    return json({ items: r.results || [] });
  }

  if (request.method === 'POST' && path === '/api/prayer') {
    const rl = await rateLimit(env, rateLimitKey('pray-post', '1h'), clientKey(request), 5);
    if (rl.limited) return error('Too many requests. Please try again later.', 429);

    const body = (await readJson(request)) || {};
    const title = clampString(body.title, 200);
    const content = clampString(body.content, 4000);
    if (!title || !content) return error('missing');
    if (title.length < 2) return error('too_short');
    if (content.length < 5) return error('too_short');

    const info = await run(
      db,
      'INSERT INTO prayer_requests (title, content, anonymous, created_at) VALUES (?, ?, 1, ?)',
      [title, content, Date.now()],
    );
    return json({ id: info.lastRowId }, { status: 201 });
  }

  const prayMatch = path.match(/^\/api\/prayer\/(\d+)\/pray$/);
  if (request.method === 'POST' && prayMatch) {
    const id = parseId(prayMatch[1]);
    if (id === null) return error('bad_id');
    const rl = await rateLimit(env, rateLimitKey('pray', '1m'), clientKey(request), 20);
    if (rl.limited) return error('You have prayed enough for now — thank you.', 429);

    const changed = await run(db, 'UPDATE prayer_requests SET prayed_count = prayed_count + 1 WHERE id = ?', [
      id,
    ]);
    if (!changed.changes) return error('not_found', 404);
    return json({ ok: true });
  }

  return null;
}
