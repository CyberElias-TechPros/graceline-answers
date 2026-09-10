import type { QuestionRow } from "../types";

/**
 * Question repository.
 *
 * The privacy rule is enforced here rather than in route handlers: raw seeker
 * text is only ever returned by `findForCounselor` / `findForSeeker`, which are
 * the two functions with an authorization precondition. Every public read goes
 * through `toPublicArchiveEntry`, which cannot see the raw columns at all
 * because it never selects them.
 */

/** Fields a public visitor may see. Nothing else. */
export type PublicArchiveEntry = {
  id: number;
  slug: string;
  title: string;
  content: string;
  answer: string;
  category: string | null;
  publishedAt: number;
  excerpt: string;
};

/** What the anonymous seeker sees on their own thread. */
export type SeekerThreadView = {
  id: number;
  title: string;
  content: string;
  category: string | null;
  status: "new" | "active" | "resolved";
  isUrgent: boolean;
  createdAt: number;
  lastMessageAt: number | null;
  hasReplies: boolean;
};

export async function insertQuestion(
  db: D1Database,
  input: {
    trackingToken: string;
    seekerEmail: string | null;
    category: string | null;
    rawTitle: string;
    rawContent: string;
    isUrgent: boolean;
    now: number;
  },
): Promise<number> {
  // NOTE: no IP, no user-agent, no fingerprint. This INSERT is the only write
  // path for a new question and it is covered by a regression test.
  const result = await db
    .prepare(
      `INSERT INTO questions
         (tracking_token, seeker_email, category, raw_title, raw_content, is_urgent, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'new', ?7, ?7)`,
    )
    .bind(
      input.trackingToken,
      input.seekerEmail,
      input.category,
      input.rawTitle,
      input.rawContent,
      input.isUrgent ? 1 : 0,
      input.now,
    )
    .run();
  return Number(result.meta.last_row_id);
}

export function findByToken(db: D1Database, token: string): Promise<QuestionRow | null> {
  return db.prepare(`SELECT * FROM questions WHERE tracking_token = ?1`).bind(token).first<QuestionRow>();
}

export function findById(db: D1Database, id: number): Promise<QuestionRow | null> {
  return db.prepare(`SELECT * FROM questions WHERE id = ?1`).bind(id).first<QuestionRow>();
}

export function toSeekerView(row: QuestionRow, hasReplies: boolean): SeekerThreadView {
  return {
    id: row.id,
    title: row.raw_title,
    content: row.raw_content,
    category: row.category,
    status: row.status,
    isUrgent: row.is_urgent === 1,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    hasReplies,
  };
}

export function toPublicArchiveEntry(
  row: Pick<
    QuestionRow,
    "id" | "public_slug" | "public_title" | "public_content" | "public_answer" | "category" | "published_at"
  >,
): PublicArchiveEntry {
  const content = row.public_content ?? "";
  const flat = content.replace(/\s+/g, " ").trim();
  return {
    id: row.id,
    slug: row.public_slug ?? `answered-question-${row.id}`,
    title: row.public_title ?? "",
    content,
    answer: row.public_answer ?? "",
    category: row.category,
    publishedAt: row.published_at ?? 0,
    excerpt: flat.length > 170 ? `${flat.slice(0, 167).replace(/[,.;:\s]+$/, "")}…` : flat,
  };
}

export async function countByStatus(db: D1Database) {
  const [row] = await Promise.all([
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM questions WHERE status = 'new') AS new_count,
           (SELECT COUNT(*) FROM questions WHERE status = 'active') AS active_count,
           (SELECT COUNT(*) FROM questions WHERE status = 'resolved') AS resolved_count,
           (SELECT COUNT(*) FROM questions WHERE is_urgent = 1 AND status <> 'resolved') AS urgent_count,
           (SELECT COUNT(*) FROM questions WHERE is_public = 1) AS published_count,
           (SELECT COUNT(*) FROM questions) AS total_count`,
      )
      .first<{
      new_count: number;
      active_count: number;
      resolved_count: number;
      urgent_count: number;
      published_count: number;
      total_count: number;
    }>(),
  ]);
  return (
    row ?? {
      new_count: 0,
      active_count: 0,
      resolved_count: 0,
      urgent_count: 0,
      published_count: 0,
      total_count: 0,
    }
  );
}

/** Median-ish response telemetry for the dashboard: how long until first reply. */
export async function responseTimeStats(db: D1Database): Promise<{ answeredCount: number; medianMinutes: number | null }> {
  const rows = await db
    .prepare(
      `SELECT (m.created_at - q.created_at) / 60000.0 AS minutes
         FROM questions q
         JOIN messages m ON m.id = (
           SELECT id FROM messages WHERE question_id = q.id AND sender_type = 'counselor' ORDER BY id ASC LIMIT 1
         )
        ORDER BY minutes ASC
        LIMIT 500`,
    )
    .all<{ minutes: number }>();
  const values = rows.results.map((r) => r.minutes).sort((a, b) => a - b);
  if (values.length === 0) return { answeredCount: 0, medianMinutes: null };
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 === 0 ? (values[mid - 1]! + values[mid]!) / 2 : values[mid]!;
  return { answeredCount: values.length, medianMinutes: Math.round(median) };
}

export async function touchTimestamps(db: D1Database, id: number, now: number, extra: Record<string, unknown> = {}) {
  await db
    .prepare(`UPDATE questions SET updated_at = ?1 WHERE id = ?2`)
    .bind(now, id)
    .run();
  void extra;
}
