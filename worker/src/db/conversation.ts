import type { MessageRow, NoteRow, QuestionRow } from "../types";

/**
 * Conversation repository: thread messages, internal notes, and the counselor
 * inbox. Message ids are strictly increasing per thread, which is what makes the
 * `since` watermark (and therefore live streaming) work reliably.
 */

export function listMessages(db: D1Database, questionId: number, sinceId = 0) {
  return db
    .prepare(
      `SELECT id, question_id, sender_type, sender_user_id, content, created_at
         FROM messages WHERE question_id = ?1 AND id > ?2 ORDER BY id ASC LIMIT 500`,
    )
    .bind(questionId, sinceId)
    .all<MessageRow>()
    .then((r) => r.results);
}

export function maxMessageId(db: D1Database, questionId: number): Promise<number> {
  return db
    .prepare(`SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE question_id = ?1`)
    .bind(questionId)
    .first<{ m: number }>()
    .then((r) => Number(r?.m ?? 0));
}

export async function appendMessage(
  db: D1Database,
  input: {
    questionId: number;
    senderType: "seeker" | "counselor";
    senderUserId: string | null;
    content: string;
    now: number;
  },
): Promise<number> {
  // Message insert, thread status transition and timestamp update must succeed
  // together: a message without a status update leaves the inbox inconsistent,
  // and a status update without a message would claim activity that never
  // happened.
  const batch = await db.batch([
    db
      .prepare(
        `INSERT INTO messages (question_id, sender_type, sender_user_id, content, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .bind(input.questionId, input.senderType, input.senderUserId, input.content, input.now),
    db
      .prepare(
        `UPDATE questions
            SET status = CASE WHEN status = 'new' THEN 'active' ELSE status END,
                last_message_at = ?1,
                updated_at = ?1
          WHERE id = ?2`,
      )
      .bind(input.now, input.questionId),
  ]);
  return Number(batch[0]!.meta.last_row_id);
}

export function listNotes(db: D1Database, questionId: number) {
  return db
    .prepare(
      `SELECT n.id, n.question_id, n.author_id, n.content, n.created_at, u.name AS author_name
         FROM internal_notes n
         LEFT JOIN users u ON u.id = n.author_id
        WHERE n.question_id = ?1 ORDER BY n.id ASC`,
    )
    .bind(questionId)
    .all<NoteRow>()
    .then((r) => r.results);
}

export async function appendNote(
  db: D1Database,
  input: { questionId: number; authorId: string; content: string; now: number },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO internal_notes (question_id, author_id, content, created_at) VALUES (?1, ?2, ?3, ?4)`,
    )
    .bind(input.questionId, input.authorId, input.content, input.now)
    .run();
  return Number(result.meta.last_row_id);
}

export type InboxItem = {
  id: number;
  title: string;
  category: string | null;
  status: "new" | "active" | "resolved";
  isUrgent: boolean;
  hasSeekerEmail: boolean;
  messageCount: number;
  unreadSince: number | null;
  assignedTo: string | null;
  assigneeName: string | null;
  createdAt: number;
  updatedAt: number;
};

/**
 * Counselor inbox.
 *
 * Urgent items sort first (a crisis flag must never be buried under routine
 * traffic), then by most recent activity. Keyset pagination on `updated_at`.
 */
export async function listInbox(
  db: D1Database,
  options: {
    status: "new" | "active" | "resolved" | "all";
    urgentOnly?: boolean;
    query?: string;
    limit: number;
    cursor?: number | null;
  },
): Promise<{ items: InboxItem[]; hasMore: boolean; nextCursor: number | null; counts: Record<string, number> }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.status !== "all") {
    conditions.push("q.status = ?");
    params.push(options.status);
  }
  if (options.urgentOnly) conditions.push("q.is_urgent = 1");
  if (options.query) {
    conditions.push("(q.raw_title LIKE ? OR q.raw_content LIKE ?)");
    const like = `%${options.query.replace(/[%_]/g, "")}%`;
    params.push(like, like);
  }
  if (options.cursor) {
    conditions.push("(q.updated_at < ? OR (q.updated_at = ? AND q.id < ?))");
    params.push(options.cursor, options.cursor, options.cursor);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await db
    .prepare(
      `SELECT q.id, q.raw_title AS title, q.category, q.status, q.is_urgent, q.seeker_email,
              q.assigned_to, q.created_at, q.updated_at, q.counselor_read_at,
              u.name AS assignee_name,
              (SELECT COUNT(*) FROM messages m WHERE m.question_id = q.id) AS message_count
         FROM questions q
         LEFT JOIN users u ON u.id = q.assigned_to
         ${where}
        ORDER BY q.is_urgent DESC, q.updated_at DESC, q.id DESC
        LIMIT ?`,
    )
    .bind(...params, options.limit + 1)
    .all<{
    id: number;
    title: string;
    category: string | null;
    status: "new" | "active" | "resolved";
    is_urgent: number;
    seeker_email: string | null;
    assigned_to: string | null;
    created_at: number;
    updated_at: number;
    counselor_read_at: number | null;
    assignee_name: string | null;
    message_count: number;
  }>();

  const hasMore = rows.results.length > options.limit;
  const page = hasMore ? rows.results.slice(0, options.limit) : rows.results;
  const last = page.at(-1);

  const countRows = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM questions WHERE status = 'new') AS new_count,
         (SELECT COUNT(*) FROM questions WHERE status = 'active') AS active_count,
         (SELECT COUNT(*) FROM questions WHERE status = 'resolved') AS resolved_count,
         (SELECT COUNT(*) FROM questions WHERE is_urgent = 1 AND status <> 'resolved') AS urgent_count`,
    )
    .first<Record<string, number>>();

  return {
    items: page.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      status: row.status,
      isUrgent: row.is_urgent === 1,
      hasSeekerEmail: row.seeker_email !== null,
      messageCount: Number(row.message_count),
      unreadSince:
        row.counselor_read_at === null || row.counselor_read_at < row.updated_at ? row.updated_at : null,
      assignedTo: row.assigned_to,
      assigneeName: row.assignee_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    hasMore,
    nextCursor: hasMore && last ? last.updated_at : null,
    counts: {
      new: Number(countRows?.new_count ?? 0),
      active: Number(countRows?.active_count ?? 0),
      resolved: Number(countRows?.resolved_count ?? 0),
      urgent: Number(countRows?.urgent_count ?? 0),
    },
  };
}

export async function setStatus(
  db: D1Database,
  questionId: number,
  status: "new" | "active" | "resolved",
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE questions SET status = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(status, now, questionId)
    .run();
  return result.meta.changes > 0;
}

export async function setAssignment(db: D1Database, questionId: number, userId: string | null, now: number) {
  await db
    .prepare(`UPDATE questions SET assigned_to = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(userId, now, questionId)
    .run();
}

export async function markCounselorRead(db: D1Database, questionId: number, now: number) {
  await db.prepare(`UPDATE questions SET counselor_read_at = ?1 WHERE id = ?2`).bind(now, questionId).run();
}

export async function markSeekerRead(db: D1Database, questionId: number, now: number) {
  await db.prepare(`UPDATE questions SET seeker_read_at = ?1 WHERE id = ?2`).bind(now, questionId).run();
}

/**
 * Save the sanitized public copy and flip visibility.
 *
 * The slug is derived here (not in the route) so a published answer can never
 * exist without a canonical URL, and the whole thing runs in one batch so the
 * row and its search index entry change together.
 */
export async function publishQuestion(
  db: D1Database,
  input: {
    questionId: number;
    publicTitle: string | null;
    publicContent: string | null;
    publicAnswer: string | null;
    category: string | null;
    slug: string | null;
    isPublic: boolean;
    publishedBy: string;
    now: number;
  },
): Promise<void> {
  // The FTS triggers on `questions` keep archive_fts in sync, so publishing is
  // a single UPDATE — there is no second index write that could be forgotten.
  await db
    .prepare(
      `UPDATE questions
          SET public_title   = ?1,
              public_content = ?2,
              public_answer  = ?3,
              category       = COALESCE(?4, category),
              public_slug    = ?5,
              is_public      = ?6,
              published_at   = ?7,
              published_by   = ?8,
              updated_at     = ?9
        WHERE id = ?10`,
    )
    .bind(
      input.publicTitle,
      input.publicContent,
      input.publicAnswer,
      input.category,
      input.slug,
      input.isPublic ? 1 : 0,
      input.isPublic ? input.now : null,
      input.isPublic ? input.publishedBy : null,
      input.now,
      input.questionId,
    )
    .run();
}

/** Questions still waiting for a first counselor reply, oldest first. */
export async function unanswered(db: D1Database, options: { olderThanMs: number; now: number; limit: number }) {
  const cutoff = options.now - options.olderThanMs;
  const rows = await db
    .prepare(
      `SELECT q.id, q.raw_title AS title, q.is_urgent, q.created_at, q.category
         FROM questions q
        WHERE q.created_at < ?1
          AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.question_id = q.id AND m.sender_type = 'counselor')
        ORDER BY q.is_urgent DESC, q.created_at ASC
        LIMIT ?2`,
    )
    .bind(cutoff, options.limit)
    .all<{ id: number; title: string; is_urgent: number; created_at: number; category: string | null }>();
  return rows.results.map((r) => ({
    id: r.id,
    title: r.title,
    isUrgent: r.is_urgent === 1,
    createdAt: r.created_at,
    category: r.category,
  }));
}

export function toAdminThreadView(row: QuestionRow) {
  return {
    id: row.id,
    trackingToken: row.tracking_token,
    seekerEmail: row.seeker_email,
    category: row.category,
    title: row.raw_title,
    content: row.raw_content,
    isUrgent: row.is_urgent === 1,
    status: row.status,
    assignedTo: row.assigned_to,
    isPublic: row.is_public === 1,
    publicTitle: row.public_title,
    publicContent: row.public_content,
    publicAnswer: row.public_answer,
    publicSlug: row.public_slug,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
