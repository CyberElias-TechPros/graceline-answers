import { hashPassword, needsRehash, verifyPassword } from "../lib/password";
import { generateUserId } from "../lib/tokens";
import type { PublicUser, UserRow } from "../types";

/**
 * Counselor / administrator accounts.
 *
 * Seekers never appear here — they are anonymous by design and hold only an
 * unguessable tracking token, so there is no seeker table to leak.
 */

const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 8;

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function findByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db
    .prepare(`SELECT * FROM users WHERE email = ?1 COLLATE NOCASE`)
    .bind(email.trim().toLowerCase())
    .first<UserRow>();
}

export function findById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare(`SELECT * FROM users WHERE id = ?1`).bind(id).first<UserRow>();
}

/** Active accounts only — a disabled counselor must never resolve a session. */
export function findActiveById(db: D1Database, id: string): Promise<UserRow | null> {
  return db
    .prepare(`SELECT * FROM users WHERE id = ?1 AND is_active = 1`)
    .bind(id)
    .first<UserRow>();
}

export type TeamMember = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "counselor";
  is_active: number;
  last_login_at: number | null;
  created_at: number;
};

export function listTeam(db: D1Database): Promise<TeamMember[]> {
  return db
    .prepare(
      `SELECT id, email, name, role, is_active, last_login_at, created_at FROM users
        ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at ASC`,
    )
    .all<TeamMember>()
    .then((r) => r.results);
}

export function countAdmins(db: D1Database): Promise<number> {
  return db
    .prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1`)
    .first<{ c: number }>()
    .then((r) => r?.c ?? 0);
}

export async function createUser(
  db: D1Database,
  input: { email: string; name: string | null; password: string; role: "admin" | "counselor"; now: number },
): Promise<PublicUser> {
  const id = generateUserId();
  const passwordHash = await hashPassword(input.password);
  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, name, role, is_active, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)`,
    )
    .bind(id, input.email.trim().toLowerCase(), passwordHash, input.name, input.role, input.now)
    .run();
  return { id, email: input.email.trim().toLowerCase(), name: input.name, role: input.role };
}

export type LoginOutcome =
  | { ok: true; user: PublicUser; rehash: string | null }
  | { ok: false; reason: "not_found" | "invalid_password" | "inactive" | "locked"; retryAfterSeconds?: number };

/**
 * Authenticate a counselor.
 *
 * Anti-enumeration: an unknown email still runs a full PBKDF2 derivation against
 * a fixed dummy hash, so the response time is indistinguishable from a wrong
 * password. The account lockout additionally throttles targeted guessing that
 * the IP rate limit alone would not catch (distributed IPs, one account).
 */
export async function authenticate(
  db: D1Database,
  email: string,
  password: string,
  now: number,
): Promise<LoginOutcome> {
  const row = await findByEmail(db, email);

  if (!row) {
    await verifyPassword(password, await dummyHash());
    return { ok: false, reason: "not_found" };
  }

  if (row.locked_until && row.locked_until > now) {
    return {
      ok: false,
      reason: "locked",
      retryAfterSeconds: Math.ceil((row.locked_until - now) / 1000),
    };
  }

  if (row.is_active !== 1) {
    await verifyPassword(password, await dummyHash());
    return { ok: false, reason: "inactive" };
  }

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    const failures = row.failed_login_count + 1;
    const lockUntil = failures >= MAX_FAILED_ATTEMPTS ? now + LOCK_DURATION_MS : null;
    await db
      .prepare(`UPDATE users SET failed_login_count = ?1, locked_until = ?2, updated_at = ?3 WHERE id = ?4`)
      .bind(failures, lockUntil, now, row.id)
      .run();
    return {
      ok: false,
      reason: "invalid_password",
      ...(lockUntil ? { retryAfterSeconds: Math.ceil(LOCK_DURATION_MS / 1000) } : {}),
    };
  }

  await db
    .prepare(`UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?1, updated_at = ?1 WHERE id = ?2`)
    .bind(now, row.id)
    .run();

  return {
    ok: true,
    user: toPublicUser(row),
    rehash: needsRehash(row.password_hash) ? await hashPassword(password) : null,
  };
}

export async function updatePasswordHash(db: D1Database, userId: string, password: string, now: number) {
  await db
    .prepare(`UPDATE users SET password_hash = ?1, failed_login_count = 0, locked_until = NULL, updated_at = ?2 WHERE id = ?3`)
    .bind(await hashPassword(password), now, userId)
    .run();
}

export async function setActive(db: D1Database, userId: string, active: boolean, now: number) {
  await db
    .prepare(`UPDATE users SET is_active = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(active ? 1 : 0, now, userId)
    .run();
}

export async function setRole(db: D1Database, userId: string, role: "admin" | "counselor", now: number) {
  await db.prepare(`UPDATE users SET role = ?1, updated_at = ?2 WHERE id = ?3`).bind(role, now, userId).run();
}

export async function deleteUser(db: D1Database, userId: string) {
  await db.prepare(`DELETE FROM users WHERE id = ?1`).bind(userId).run();
}

/** Counselor inboxes are notified by email; this powers the digest cron. */
export function listCounselorEmails(db: D1Database) {
  return db
    .prepare(`SELECT email FROM users WHERE is_active = 1 AND role IN ('admin', 'counselor') ORDER BY created_at ASC`)
    .all<{ email: string }>()
    .then((r) => r.results.map((row) => row.email));
}

export function countUsers(db: D1Database): Promise<number> {
  return db.prepare(`SELECT COUNT(*) AS c FROM users`).first<{ c: number }>().then((r) => r?.c ?? 0);
}

/**
 * A real PBKDF2 digest of a throwaway password, computed once and reused.
 *
 * Unknown accounts and deactivated accounts verify against this instead of
 * returning early, so response time is indistinguishable from a wrong password
 * and the endpoint cannot be used to enumerate which emails are registered.
 */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("graceline-timing-equaliser-not-a-real-credential");
  return dummyHashPromise;
}
