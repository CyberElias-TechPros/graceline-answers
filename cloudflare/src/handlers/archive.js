/**
 * Public archive (only hand-sanitized, counselor-published content):
 *
 *   GET /api/archive            list + FTS search + category filter + pagination
 *   GET /api/archive/categories list of categories
 *   GET /api/archive/:id        single published item
 */
import { json, error } from '../respond.js';
import { CATEGORIES } from './questions.js';

const SELECT_PUBLIC = `SELECT id, public_title AS title, public_content AS content,
              public_answer AS answer, category, created_at FROM questions`;

/**
 * Build a safe FTS5 MATCH expression: keep only alphanumeric word tokens,
 * quote each, join with a space (AND semantics, porter stemming).
 */
function buildFtsMatch(rawQuery) {
  const words = String(rawQuery || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  if (!words.length) return null;
  return words.map((w) => `"${w}"`).join(' ');
}

export async function handleArchive(request, env, db, url) {
  if (request.method !== 'GET') return null;
  const path = url.pathname;

  if (path === '/api/archive/categories') {
    return json({ categories: CATEGORIES });
  }

  if (path === '/api/archive') {
    const q = (url.searchParams.get('q') || '').trim();
    const category = (url.searchParams.get('category') || '').trim();
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    const fetchLimit = limit + 1;

    let items;
    const term = q ? buildFtsMatch(q) : null;
    if (term) {
      const r = await db
        .prepare(
          `SELECT q.id, q.public_title AS title, q.public_content AS content,
                  q.public_answer AS answer, q.category, q.created_at
           FROM archive_fts
           JOIN questions q ON q.id = archive_fts.rowid
           WHERE archive_fts MATCH ? AND q.is_public = 1
           ORDER BY q.created_at DESC LIMIT ? OFFSET ?`,
        )
        .bind(term, fetchLimit, offset)
        .all();
      items = r.results || [];
    } else {
      const where = ['is_public = 1'];
      const params = [];
      if (category && CATEGORIES.includes(category)) {
        where.push('category = ?');
        params.push(category);
      }
      const sql = `${SELECT_PUBLIC} WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      const r = await db.prepare(sql).bind(...params, fetchLimit, offset).all();
      items = r.results || [];
    }

    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    return json({
      items: pageItems,
      hasMore,
      limit,
      offset,
      nextOffset: hasMore ? offset + limit : null,
    });
  }

  const idMatch = path.match(/^\/api\/archive\/(\d+)$/);
  if (idMatch) {
    const row = await db
      .prepare(
        `SELECT id, public_title AS title, public_content AS content,
                public_answer AS answer, category, created_at
         FROM questions WHERE id = ? AND is_public = 1`,
      )
      .bind(Number(idMatch[1]))
      .first();
    if (!row) return error('not_found', 404);
    return json(row);
  }

  return null;
}
