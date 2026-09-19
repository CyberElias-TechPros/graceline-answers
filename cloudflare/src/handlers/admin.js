/**
 * Counselor console + admin:
 *
 *   POST /api/admin/login                  (rate limited)
 *   POST /api/admin/logout
 *   GET  /api/admin/me
 *   GET  /api/admin/questions?status=      inbox (new/active/resolved)
 *   GET  /api/admin/questions/:id          full thread (raw content + notes)
 *   POST /api/admin/questions/:id/note     internal note
 *   POST /api/admin/questions/:id/status   set status (new/active/resolved)
 *   POST /api/admin/questions/:id/claim    claim the question for yourself
 *   POST /api/admin/questions/:id/unclaim  release your assignment
 *   POST /api/admin/questions/:id/publish  sanitize + publish / unpublish
 *   GET  /api/admin/stats
 *   GET  /api/admin/team                   (admin)
 *   POST /api/admin/team                   (admin) add counselor
 *   POST /api/admin/team/:id/password      (admin) reset password
 *   DELETE /api/admin/team/:id             (admin) remove counselor
 */
import { json, error, readJson } from '../respond.js';
import { clampString, parseId, clientKey } from '../util.js';
import { ensureBootstrap, first, run, all } from '../db.js';
import {
  readUser,
  loginUser,
  signUser,
  setAuthCookieHeader,
  clearAuthCookieHeader,
  hashPassword,
} from '../auth.js';
import { rateLimit, rateLimitKey } from '../rate-limit.js';

const ROLES = ['admin', 'counselor'];

export async function handleAdmin(request, env, db, url) {
  const path = url.pathname;
  const method = request.method;

  // Only this handler's own namespace — never 401 on foreign paths.
  if (!path.startsWith('/api/admin')) return null;

  if (method === 'POST' && path === '/api/admin/login') {
    const rl = await rateLimit(env, rateLimitKey('login', '15m'), clientKey(request), 10);
    if (rl.limited) return error('Too many login attempts. Please try again later.', 429);

    await ensureBootstrap(env, db);
    const body = (await readJson(request)) || {};
    if (!body.email || !body.password) return error('missing');
    const user = await loginUser(body.email, body.password, env, db);
    if (!user) return error('invalid_credentials', 401);
    const token = await signUser(user, env);
    return json({ user }, { headers: { 'set-cookie': setAuthCookieHeader(request, token) } });
  }

  if (method === 'POST' && path === '/api/admin/logout') {
    return json({ ok: true }, { headers: { 'set-cookie': clearAuthCookieHeader() } });
  }

  if (method === 'GET' && path === '/api/admin/me') {
    const user = await readUser(request, env, db);
    return json({ user });
  }

  // Everything below requires authentication.
  const user = await readUser(request, env, db);
  if (!user) return error('unauthorized', 401);

  if (method === 'GET' && path === '/api/admin/questions') {
    const status = url.searchParams.get('status') || 'new';
    const allowed = ['new', 'active', 'resolved'];
    const st = allowed.includes(status) ? status : 'new';
    const rows = await all(
      db,
      `SELECT q.id, q.tracking_token, q.raw_title AS title, q.category, q.is_urgent,
              q.status, q.seeker_email, q.created_at, q.updated_at,
              q.assigned_to, u.name AS assigned_to_name
       FROM questions q
       LEFT JOIN users u ON u.id = q.assigned_to
       WHERE q.status = ?
       ORDER BY q.is_urgent DESC, q.updated_at DESC LIMIT 200`,
      [st],
    );
    return json({ items: rows });
  }

  const idMatch = path.match(/^\/api\/admin\/questions\/(\d+)(?:\/(note|status|claim|unclaim|publish))?$/);
  if (idMatch) {
    const id = parseId(idMatch[1]);
    const action = idMatch[2] || '';
    if (id === null) return error('bad_id');
    const q = await first(db, 'SELECT * FROM questions WHERE id = ?', [id]);
    if (!q) return error('not_found', 404);

    if (!action && method === 'GET') {
      const messages = await all(
        db,
        `SELECT m.*, u.name AS sender_name
         FROM messages m LEFT JOIN users u ON u.id = m.sender_user_id
         WHERE m.question_id = ? ORDER BY m.id ASC`,
        [id],
      );
      const notes = await all(
        db,
        `SELECT n.*, u.name AS author_name FROM internal_notes n
         LEFT JOIN users u ON u.id = n.author_id
         WHERE n.question_id = ? ORDER BY n.id ASC`,
        [id],
      );
      return json({ question: q, messages, notes });
    }

    if (action === 'note') {
      if (method !== 'POST') return error('method_not_allowed', 405);
      const body = (await readJson(request)) || {};
      const content = clampString(body.content, 8000);
      if (!content) return error('empty');
      await run(
        db,
        'INSERT INTO internal_notes (question_id, author_id, content, created_at) VALUES (?, ?, ?, ?)',
        [id, user.id, content, Date.now()],
      );
      return json({ ok: true }, { status: 201 });
    }

    if (action === 'status') {
      if (method !== 'POST') return error('method_not_allowed', 405);
      const body = (await readJson(request)) || {};
      if (!['new', 'active', 'resolved'].includes(body.status)) {
        return error('bad_status');
      }
      const changed = await run(db, 'UPDATE questions SET status = ?, updated_at = ? WHERE id = ?', [
        body.status,
        Date.now(),
        id,
      ]);
      if (!changed.changes) return error('not_found', 404);
      return json({ ok: true });
    }

    if (action === 'claim') {
      if (method !== 'POST') return error('method_not_allowed', 405);
      const q = await first(db, 'SELECT id, assigned_to FROM questions WHERE id = ?', [id]);
      if (!q) return error('not_found', 404);
      if (q.assigned_to === user.id) return json({ ok: true, already: true });
      if (q.assigned_to && q.assigned_to !== user.id && user.role !== 'admin') {
        return error('already_assigned', 409);
      }
      await run(db, 'UPDATE questions SET assigned_to = ?, updated_at = ? WHERE id = ?', [
        user.id,
        Date.now(),
        id,
      ]);
      return json({ ok: true, assigned_to: user.id });
    }

    if (action === 'unclaim') {
      if (method !== 'POST') return error('method_not_allowed', 405);
      const q = await first(db, 'SELECT id, assigned_to FROM questions WHERE id = ?', [id]);
      if (!q) return error('not_found', 404);
      if (q.assigned_to !== user.id && user.role !== 'admin') {
        return error('forbidden', 403);
      }
      await run(db, 'UPDATE questions SET assigned_to = NULL, updated_at = ? WHERE id = ?', [
        Date.now(),
        id,
      ]);
      return json({ ok: true });
    }

    if (action === 'publish') {
      if (method !== 'POST') return error('method_not_allowed', 405);
      const body = (await readJson(request)) || {};
      const pt = clampString(body.public_title, 300);
      const pc = clampString(body.public_content, 12000);
      const pa = clampString(body.public_answer, 20000);
      const cat = clampString(body.category, 50) || null;
      const isPublic = !!body.is_public;

      if (isPublic && (!pt || !pc || !pa)) {
        return error('sanitized_fields_required');
      }

      const changed = await run(
        db,
        `UPDATE questions SET public_title = ?, public_content = ?, public_answer = ?,
           category = COALESCE(?, category), is_public = ?, updated_at = ? WHERE id = ?`,
        [pt || null, pc || null, pa || null, cat, isPublic ? 1 : 0, Date.now(), id],
      );
      if (!changed.changes) return error('not_found', 404);

      // Sync FTS (contentless table: delete + insert).
      await run(db, 'DELETE FROM archive_fts WHERE rowid = ?', [id]);
      if (isPublic) {
        await run(
          db,
          `INSERT INTO archive_fts (rowid, public_title, public_content, public_answer, category)
           VALUES (?, ?, ?, ?, ?)`,
          [id, pt || '', pc || '', pa || '', cat || ''],
        );
      }
      return json({ ok: true, published: isPublic });
    }
  }

  if (method === 'GET' && path === '/api/admin/stats') {
    const row = await first(
      db,
      `SELECT
        (SELECT COUNT(*) FROM questions WHERE status='new') AS new_count,
        (SELECT COUNT(*) FROM questions WHERE status='active') AS active_count,
        (SELECT COUNT(*) FROM questions WHERE is_urgent=1 AND status<>'resolved') AS urgent_count,
        (SELECT COUNT(*) FROM questions WHERE is_public=1) AS public_count,
        (SELECT COUNT(*) FROM users WHERE role IN ('admin','counselor')) AS counselor_count`,
    );
    return json(row || {});
  }

  // ---- Team management (admin-only) ----
  if (path === '/api/admin/team' || path.startsWith('/api/admin/team/')) {
    if (user.role !== 'admin') return error('forbidden', 403);

    if (method === 'GET' && path === '/api/admin/team') {
      const rows = await all(
        db,
        'SELECT id, email, name, role, created_at FROM users ORDER BY role ASC, created_at ASC',
      );
      return json({ items: rows });
    }

    if (method === 'POST' && path === '/api/admin/team') {
      const body = (await readJson(request)) || {};
      const email = clampString(body.email, 255).toLowerCase();
      const name = clampString(body.name, 120);
      const password = body.password ? String(body.password) : '';
      const role = body.role && ROLES.includes(body.role) ? body.role : 'counselor';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return error('invalid_email');
      }
      if (password.length < 10) {
        return error('password_too_short');
      }
      const existing = await first(db, 'SELECT id FROM users WHERE email = ?', [email]);
      if (existing) return error('email_exists', 409);

      const hash = await hashPassword(password);
      const info = await run(
        db,
        'INSERT INTO users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?)',
        [email, hash, name || null, role, Date.now()],
      );
      return json(
        { id: info.lastRowId, email, name: name || null, role },
        { status: 201 },
      );
    }

    const pwMatch = path.match(/^\/api\/admin\/team\/(\d+)\/password$/);
    if (method === 'POST' && pwMatch) {
      const id = parseId(pwMatch[1]);
      if (id === null) return error('bad_id');
      const body = (await readJson(request)) || {};
      const password = body.password ? String(body.password) : '';
      if (password.length < 10) return error('password_too_short');
      const changed = await run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', [
        await hashPassword(password),
        id,
      ]);
      if (!changed.changes) return error('not_found', 404);
      return json({ ok: true });
    }

    const delMatch = path.match(/^\/api\/admin\/team\/(\d+)$/);
    if (method === 'DELETE' && delMatch) {
      const id = parseId(delMatch[1]);
      if (id === null) return error('bad_id');
      if (id === user.id) return error('cannot_delete_self');
      const target = await first(db, 'SELECT id, role FROM users WHERE id = ?', [id]);
      if (!target) return error('not_found', 404);
      if (target.role === 'admin') {
        const admins = await first(db, "SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
        if (admins && admins.c <= 1) return error('cannot_delete_last_admin');
      }
      await run(db, 'DELETE FROM users WHERE id = ?', [id]);
      return json({ ok: true });
    }
  }

  return null;
}
