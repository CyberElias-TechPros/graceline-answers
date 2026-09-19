/**
 * D1 helpers + bootstrap seeding.
 *
 * Schema is created by `migrations/0001_init.sql` (applied with
 * `wrangler d1 migrations apply`). On a fresh database the worker seeds a
 * bootstrap admin from ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD,
 * exactly like the cPanel backend does on first boot.
 */
import { hashPassword } from './auth.js';

let bootstrapChecked = false;

/** Idempotent first-boot seed. Safe to call from every request. */
export async function ensureBootstrap(env, db) {
  if (bootstrapChecked) return;
  const row = await db.prepare('SELECT COUNT(*) AS c FROM users').first();
  if (row && row.c > 0) {
    bootstrapChecked = true;
    return;
  }
  const email = (env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const pw = env.ADMIN_BOOTSTRAP_PASSWORD || '';
  if (!email || !pw) {
    console.warn(
      '[graceline-answers] No users and no ADMIN_BOOTSTRAP_EMAIL/PASSWORD set. Skipping bootstrap seed.',
    );
    bootstrapChecked = true;
    return;
  }
  try {
    const hash = await hashPassword(pw);
    await db
      .prepare('INSERT INTO users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(email, hash, 'Lead Counselor', 'admin', Date.now())
      .run();
    console.log(`[graceline-answers] Seeded bootstrap admin: ${email}`);
  } catch (e) {
    // Race: another worker instance seeded concurrently. Non-fatal.
    console.log('[graceline-answers] Bootstrap seed skipped:', e && e.message ? e.message : e);
  }
  bootstrapChecked = true;
}

/** Convenience: first() with a null result. */
export async function first(db, sql, params = []) {
  const r = await db.prepare(sql).bind(...params).first();
  return r || null;
}

export async function all(db, sql, params = []) {
  const r = await db.prepare(sql).bind(...params).all();
  return r.results || [];
}

/** run() returning { changes, lastRowId }. */
export async function run(db, sql, params = []) {
  const r = await db.prepare(sql).bind(...params).run();
  const meta = r.meta || {};
  const rawId = meta.last_row_id != null ? meta.last_row_id : meta.lastRowId;
  return {
    changes: meta.changes ? meta.changes : 0,
    lastRowId: rawId != null ? Number(rawId) : null,
  };
}
