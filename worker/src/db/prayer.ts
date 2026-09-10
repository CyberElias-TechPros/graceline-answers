import type { PrayerRow } from "../types";

/**
 * Community prayer wall.
 *
 * Requests are anonymous at the schema level — there is no author column, so
 * there is nothing to attribute a request back to.
 */

export type PrayerView = {
  id: number;
  title: string;
  content: string;
  prayedCount: number;
  createdAt: number;
};

function toView(row: PrayerRow): PrayerView {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    prayedCount: row.prayed_count,
    createdAt: row.created_at,
  };
}

export async function listPrayers(
  db: D1Database,
  options: { limit: number; cursor?: number | null },
): Promise<{ items: PrayerView[]; hasMore: boolean; nextCursor: number | null }> {
  const conditions = ["is_hidden = 0"];
  const params: unknown[] = [];
  if (options.cursor) {
    conditions.push("(created_at < ? OR (created_at = ? AND id < ?))");
    params.push(options.cursor, options.cursor, options.cursor);
  }
  const rows = await db
    .prepare(
      `SELECT id, title, content, prayed_count, is_hidden, created_at FROM prayer_requests
        WHERE ${conditions.join(" AND ")}
        ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...params, options.limit + 1)
    .all<PrayerRow>();

  const hasMore = rows.results.length > options.limit;
  const page = hasMore ? rows.results.slice(0, options.limit) : rows.results;
  const last = page.at(-1);
  return {
    items: page.map(toView),
    hasMore,
    nextCursor: hasMore && last ? last.created_at : null,
  };
}

export async function createPrayer(
  db: D1Database,
  input: { title: string; content: string; now: number },
): Promise<PrayerView> {
  const result = await db
    .prepare(`INSERT INTO prayer_requests (title, content, prayed_count, is_hidden, created_at) VALUES (?1, ?2, 0, 0, ?3)`)
    .bind(input.title, input.content, input.now)
    .run();
  return {
    id: Number(result.meta.last_row_id),
    title: input.title,
    content: input.content,
    prayedCount: 0,
    createdAt: input.now,
  };
}

/**
 * Increment the "I prayed" counter.
 *
 * The increment is a single atomic statement, so concurrent prayers from
 * different isolates cannot lose a count. Returns null when the id is unknown,
 * which lets the route answer 404 rather than silently succeeding.
 */
export async function incrementPrayed(
  db: D1Database,
  id: number,
): Promise<{ prayedCount: number } | null> {
  const result = await db
    .prepare(`UPDATE prayer_requests SET prayed_count = prayed_count + 1 WHERE id = ?1 AND is_hidden = 0`)
    .bind(id)
    .run();
  if (result.meta.changes === 0) return null;
  const row = await db.prepare(`SELECT prayed_count FROM prayer_requests WHERE id = ?1`).bind(id).first<{
    prayed_count: number;
  }>();
  return { prayedCount: Number(row?.prayed_count ?? 0) };
}

export async function setHidden(db: D1Database, id: number, hidden: boolean): Promise<boolean> {
  const result = await db
    .prepare(`UPDATE prayer_requests SET is_hidden = ?1 WHERE id = ?2`)
    .bind(hidden ? 1 : 0, id)
    .run();
  return result.meta.changes > 0;
}

export async function totalPrayers(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(SUM(prayed_count), 0) AS total FROM prayer_requests WHERE is_hidden = 0`)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}
