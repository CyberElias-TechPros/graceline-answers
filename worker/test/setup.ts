import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, beforeEach } from "vitest";

/**
 * Isolated storage is off (see vitest.config.ts) because Durable Object tests
 * are incompatible with it, so every test in a file shares one database. This
 * empties it before each test to keep them independent and order-proof.
 */
const TABLES = ["messages", "internal_notes", "questions", "prayer_requests", "audit_log", "users"];

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.MIGRATIONS);
});

beforeEach(async () => {
  // Children first: messages and notes reference questions and users.
  const ordered = ["messages", "internal_notes", "audit_log", "questions", "prayer_requests", "users"];
  await env.DB.batch(ordered.map((table) => env.DB.prepare(`DELETE FROM ${table}`).bind()));
  // sqlite_sequence is deliberately NOT reset. Question ids stay monotonic across
  // tests, exactly as they are in production, so a ThreadRoom Durable Object is
  // never reused for a different conversation and a stale watermark can never
  // make a streaming test pass for the wrong reason.
  // The external-content FTS index has its own rowid space; clear it too so a
  // stale index can never make a search test pass for the wrong reason.
  await env.DB.prepare(`INSERT INTO archive_fts(archive_fts) VALUES('rebuild')`).run();
  void TABLES;
});
