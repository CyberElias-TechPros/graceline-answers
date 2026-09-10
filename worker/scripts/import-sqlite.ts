/**
 * One-way import of a legacy cPanel SQLite database into the Cloudflare D1
 * schema defined in `migrations/0001_init.sql`.
 *
 *     # Emit a reviewed SQL file without touching anything:
 *     npx tsx scripts/import-sqlite.ts --source /path/to/legacy.sqlite --out import.sql
 *
 *     # Emit and apply to the local development database:
 *     npx tsx scripts/import-sqlite.ts --source /path/to/legacy.sqlite --apply-local
 *
 * The script only ever READS the source database. Applying is a separate,
 * explicit step an operator reviews, because a migration is easier to trust
 * when a person has looked at the SQL before it runs.
 *
 * Deliberate, documented decisions:
 *
 *   • Question, message, note and prayer integer ids are preserved so links
 *     survive exactly. The target must therefore be an empty schema; there is no
 *     transaction wrapper because `wrangler d1 execute` refuses BEGIN/COMMIT —
 *     a half-applied run is recovered by wiping the empty target and re-running.
 *   • Users keep email, name, role and creation date but are imported with
 *     `is_active = 0`. Legacy passwords are bcrypt; the Worker verifies PBKDF2
 *     and cannot run bcrypt within its CPU budget, so a hash cannot be carried
 *     over. The operator bootstraps a fresh admin, then re-activates and resets
 *     each counselor from the console. Importing an unverifiable hash would be
 *     worse.
 *   • Integer user references (assigned_to, sender_user_id) are remapped to the
 *     new TEXT ids, and set to NULL when the referenced legacy user is missing.
 *   • Internal notes whose author no longer exists cannot be imported, because
 *     `internal_notes.author_id` is NOT NULL. They are dropped and reported,
 *     never attributed to a fabricated user.
 *   • Public questions get a computed `public_slug` in the application's own
 *     `{title}-{base36(id)}` format and `published_at` taken from the legacy
 *     `updated_at`. `published_by` is unknown and left NULL.
 *   • The full-text index is never written directly. Rows are inserted with the
 *     same columns the schema's triggers watch, so `archive_fts` is populated by
 *     the triggers exactly as it would be in production.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "../../shared/site";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

interface LegacyUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  created_at: number;
}

interface LegacyQuestion {
  id: number;
  tracking_token: string;
  seeker_email: string | null;
  category: string | null;
  raw_title: string;
  raw_content: string;
  public_title: string | null;
  public_content: string | null;
  public_answer: string | null;
  is_public: number;
  is_urgent: number;
  status: string;
  assigned_to: number | null;
  created_at: number;
  updated_at: number;
}

interface Args {
  source: string;
  out?: string;
  applyLocal?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { source: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") args.source = argv[++i] ?? "";
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--apply-local") args.applyLocal = true;
  }
  if (!args.source) {
    console.error(
      "Usage: npx tsx scripts/import-sqlite.ts --source <legacy.sqlite> [--out file.sql] [--apply-local]",
    );
    process.exit(2);
  }
  return args;
}

/** SQL-escape a possibly-null string. */
function esc(value: string | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourcePath = resolve(args.source);
  if (!existsSync(sourcePath)) {
    console.error(`Source database not found: ${sourcePath}`);
    process.exit(1);
  }

  const db = new DatabaseSync(sourcePath, { readOnly: true });

  const users = db
    .prepare(`SELECT id, email, name, role, created_at FROM users ORDER BY id`)
    .all() as unknown as LegacyUser[];

  const questions = db
    .prepare(
      `SELECT id, tracking_token, seeker_email, category, raw_title, raw_content,
              public_title, public_content, public_answer, is_public, is_urgent,
              status, assigned_to, created_at, updated_at
       FROM questions ORDER BY id`,
    )
    .all() as unknown as LegacyQuestion[];

  const messages = db
    .prepare(
      `SELECT id, question_id, sender_type, sender_user_id, content, created_at
       FROM messages ORDER BY id`,
    )
    .all() as {
    id: number;
    question_id: number;
    sender_type: string;
    sender_user_id: number | null;
    content: string;
    created_at: number;
  }[];

  const notes = db
    .prepare(`SELECT id, question_id, author_id, content, created_at FROM internal_notes ORDER BY id`)
    .all() as {
    id: number;
    question_id: number;
    author_id: number | null;
    content: string;
    created_at: number;
  }[];

  const prayers = db
    .prepare(`SELECT id, title, content, prayed_count, created_at FROM prayer_requests ORDER BY id`)
    .all() as {
    id: number;
    title: string;
    content: string;
    prayed_count: number;
    created_at: number;
  }[];

  db.close();

  const out: string[] = [];
  out.push(`-- GraceLine Answers: import from legacy SQLite ${sourcePath}`);
  out.push(`-- Generated ${new Date().toISOString()}. Review before applying.`);
  out.push(`-- Users are imported INACTIVE: legacy bcrypt hashes cannot be verified by the`);
  out.push(`-- Worker's PBKDF2 verifier. Reset each password from the console after bootstrap.`);
  out.push(`-- No transaction wrapper (wrangler d1 execute refuses BEGIN/COMMIT). The target is`);
  out.push(`-- an empty schema, so a half-applied run is recovered by wiping it and re-running.`);

  // Integer legacy id -> new TEXT id.
  const userMap = new Map<number, string>();
  for (const user of users) {
    const newId = randomUUID();
    userMap.set(user.id, newId);
    const role = user.role === "admin" ? "admin" : "counselor";
    out.push(
      `INSERT INTO users (id, email, password_hash, name, role, is_active, created_at, updated_at)` +
        ` VALUES (${esc(newId)}, ${esc(String(user.email).toLowerCase().trim())},` +
        ` 'imported-reset-required', ${esc(user.name)}, ${esc(role)}, 0, ${Number(user.created_at)},` +
        ` ${Number(user.created_at)});`,
    );
  }

  /** Map a legacy integer user reference to its new TEXT id, or the SQL NULL. */
  const fk = (legacyId: number | null | undefined): string => {
    if (legacyId === null || legacyId === undefined) return "NULL";
    const mapped = userMap.get(Number(legacyId));
    return mapped ? esc(mapped) : "NULL";
  };

  let publicCount = 0;
  for (const q of questions) {
    const publishable = q.is_public === 1 && q.public_title && q.public_content && q.public_answer;
    if (publishable) publicCount += 1;
    const slug = publishable ? `${slugify(String(q.public_title))}-${q.id.toString(36)}` : null;
    const publishedAt = publishable ? Number(q.updated_at) : null;

    out.push(
      `INSERT INTO questions (id, tracking_token, seeker_email, category, raw_title, raw_content,` +
        ` public_title, public_content, public_answer, public_slug, is_public, published_at,` +
        ` published_by, is_urgent, status, assigned_to, last_message_at, seeker_read_at,` +
        ` counselor_read_at, created_at, updated_at)` +
        ` VALUES (${q.id}, ${esc(q.tracking_token)}, ${esc(q.seeker_email)}, ${esc(q.category)},` +
        ` ${esc(q.raw_title)}, ${esc(q.raw_content)}, ${esc(q.public_title)}, ${esc(q.public_content)},` +
        ` ${esc(q.public_answer)}, ${esc(slug)}, ${publishable ? 1 : 0},` +
        ` ${publishedAt === null ? "NULL" : String(publishedAt)}, NULL, ${q.is_urgent === 1 ? 1 : 0},` +
        ` ${esc(q.status)}, ${fk(q.assigned_to)}, NULL, NULL, NULL,` +
        ` ${Number(q.created_at)}, ${Number(q.updated_at)});`,
    );
  }

  for (const m of messages) {
    out.push(
      `INSERT INTO messages (id, question_id, sender_type, sender_user_id, content, created_at)` +
        ` VALUES (${m.id}, ${m.question_id}, ${esc(m.sender_type)}, ${fk(m.sender_user_id)},` +
        ` ${esc(m.content)}, ${Number(m.created_at)});`,
    );
  }

  let skippedNotes = 0;
  for (const n of notes) {
    // internal_notes.author_id is NOT NULL, so a note whose author no longer
    // exists cannot be imported. Drop it and report the count rather than
    // fabricating an attribution.
    if (n.author_id !== null && n.author_id !== undefined && !userMap.has(Number(n.author_id))) {
      skippedNotes += 1;
      continue;
    }
    out.push(
      `INSERT INTO internal_notes (id, question_id, author_id, content, created_at)` +
        ` VALUES (${n.id}, ${n.question_id}, ${fk(n.author_id)}, ${esc(n.content)},` +
        ` ${Number(n.created_at)});`,
    );
  }

  for (const p of prayers) {
    out.push(
      `INSERT INTO prayer_requests (id, title, content, prayed_count, is_hidden, created_at)` +
        ` VALUES (${p.id}, ${esc(p.title)}, ${esc(p.content)}, ${Number(p.prayed_count)}, 0,` +
        ` ${Number(p.created_at)});`,
    );
  }

  // Back-fill conversation ordering so the inbox reads like the live system.
  out.push(
    `UPDATE questions SET last_message_at = (SELECT MAX(created_at) FROM messages` +
      ` WHERE messages.question_id = questions.id) WHERE EXISTS` +
      ` (SELECT 1 FROM messages WHERE messages.question_id = questions.id);`,
  );

  const sql = out.join("\n") + "\n";

  // `wrangler d1 execute` reads a file, so an apply needs the SQL on disk even
  // when the caller did not ask for a persistent --out path.
  const outFile = args.out ? resolve(args.out) : undefined;
  if (outFile) {
    writeFileSync(outFile, sql);
    console.log(`Wrote ${outFile} (${out.length} statements)`);
  } else if (!args.applyLocal) {
    process.stdout.write(sql);
  }

  if (args.applyLocal) {
    const { tmpdir } = await import("node:os");
    const applyPath = outFile ?? resolve(tmpdir(), "graceline-import.sql");
    writeFileSync(applyPath, sql);
    execFileSync("npx", ["wrangler", "d1", "execute", "graceline-db", "--local", "--file", applyPath], {
      cwd: root,
      stdio: "inherit",
    });
    console.log("Applied to local D1. Imported users are inactive — reset passwords in the console.");
  }

  console.error(
    `Summary: ${users.length} users (inactive), ${questions.length} questions (${publicCount} public), ` +
      `${messages.length} messages, ${notes.length - skippedNotes} notes imported` +
      (skippedNotes ? ` (${skippedNotes} orphaned note(s) skipped)` : "") +
      `, ${prayers.length} prayers`,
  );
}

main();
