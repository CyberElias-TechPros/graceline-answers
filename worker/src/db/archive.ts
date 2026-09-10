import { toPublicArchiveEntry, type PublicArchiveEntry } from "./questions";

/**
 * Public archive repository — search and listing over *published* answers only.
 *
 * Every query here carries `is_public = 1`, so even if a caller forgets a guard
 * the private rows cannot leak. The select list never includes the raw columns.
 */

const PUBLIC_COLUMNS = `q.id, q.public_slug, q.public_title, q.public_content, q.public_answer, q.category, q.published_at`;

export type ArchivePage = {
  items: PublicArchiveEntry[];
  hasMore: boolean;
  nextCursor: number | null;
  total: number;
};

/**
 * Turn free text into a safe FTS5 MATCH expression.
 *
 * FTS5 treats `+ - ~ ^ : * ( ) "` as operators, so passing user input straight
 * through both breaks the query and lets a user craft expensive expressions.
 * We keep only letter/number runs and quote each one, which yields predictable
 * "contains all of these words" semantics with porter stemming handling
 * inflections.
 */
export function buildFtsMatch(rawQuery: string): string | null {
  const words = (String(rawQuery ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 12);
  if (words.length === 0) return null;
  return words.map((word) => `"${word}"`).join(" AND ");
}

/**
 * Keyset pagination on `published_at` + `id`.
 *
 * OFFSET pagination drifts when rows are published or unpublished mid-scroll and
 * gets slower as the offset grows; a keyset cursor is stable and index-backed.
 */
export async function listArchive(
  db: D1Database,
  options: { category?: string | null; limit: number; cursor?: number | null },
): Promise<ArchivePage> {
  const limit = options.limit;
  const conditions = ["q.is_public = 1"];
  const params: unknown[] = [];

  if (options.category) {
    conditions.push("q.category = ?");
    params.push(options.category);
  }
  if (options.cursor) {
    conditions.push("(q.published_at < ? OR (q.published_at = ? AND q.id < ?))");
    params.push(options.cursor, options.cursor, options.cursor);
  }

  const where = conditions.join(" AND ");
  const rows = await db
    .prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM questions q WHERE ${where}
        ORDER BY q.published_at DESC, q.id DESC LIMIT ?`,
    )
    .bind(...params, limit + 1)
    .all();

  return finalize(rows.results, limit, options.cursor ?? null);
}

export async function searchArchive(
  db: D1Database,
  options: { query: string; category?: string | null; limit: number; cursor?: number | null },
): Promise<ArchivePage> {
  const match = buildFtsMatch(options.query);
  if (!match) {
    return listArchive(db, options);
  }

  const limit = options.limit;
  const conditions = ["q.is_public = 1", "archive_fts MATCH ?"];
  const params: unknown[] = [match];

  if (options.category) {
    conditions.push("q.category = ?");
    params.push(options.category);
  }
  if (options.cursor) {
    conditions.push("(q.published_at < ? OR (q.published_at = ? AND q.id < ?))");
    params.push(options.cursor, options.cursor, options.cursor);
  }

  // bm25 with a boost on the title column so a title match outranks a body match.
  const rows = await db
    .prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM archive_fts
         JOIN questions q ON q.id = archive_fts.rowid
        WHERE ${conditions.join(" AND ")}
        ORDER BY bm25(archive_fts, 4.0, 1.0, 1.5, 1.0) ASC, q.id DESC
        LIMIT ?`,
    )
    .bind(...params, limit + 1)
    .all();

  return finalize(rows.results, limit, options.cursor ?? null);
}

function finalize(
  results: unknown[],
  limit: number,
  cursor: number | null,
): ArchivePage {
  const hasMore = results.length > limit;
  const page = (hasMore ? results.slice(0, limit) : results).map((row) =>
    toPublicArchiveEntry(row as Parameters<typeof toPublicArchiveEntry>[0]),
  );
  const last = page.at(-1);
  return {
    items: page,
    hasMore,
    nextCursor: hasMore && last ? last.publishedAt : null,
    total: 0,
  };
}

export async function countArchive(
  db: D1Database,
  options: { category?: string | null } = {},
): Promise<number> {
  const params: unknown[] = [];
  const categoryFilter = options.category ? " AND category = ?" : "";
  if (options.category) params.push(options.category);
  const row = await db
    .prepare(`SELECT COUNT(*) AS c FROM questions WHERE is_public = 1${categoryFilter}`)
    .bind(...params)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/** Counts per category, used for the archive index and category landing pages. */
export async function categoryCounts(db: D1Database): Promise<Record<string, number>> {
  const rows = await db
    .prepare(
      `SELECT category, COUNT(*) AS c FROM questions
        WHERE is_public = 1 AND category IS NOT NULL
        GROUP BY category ORDER BY c DESC`,
    )
    .all<{ category: string; c: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.category, r.c]));
}

export type ArchiveDetail = PublicArchiveEntry & { related: PublicArchiveEntry[] };

/** One published answer plus a few related ones from the same category. */
export async function findPublishedBySlugOrId(
  db: D1Database,
  identifier: string,
): Promise<PublicArchiveEntry | null> {
  // Published answers are addressed by slug. A bare numeric id still resolves so
  // that links sent before slugs existed keep working; the route then redirects
  // to the canonical slug. The placeholder count must match the bind count, so
  // the id branch is appended rather than OR-ed into a fixed query.
  const isNumeric = /^\d{1,15}$/.test(identifier);
  const where = isNumeric ? "q.is_public = 1 AND (q.public_slug = ?1 OR q.id = ?2)" : "q.is_public = 1 AND q.public_slug = ?1";
  const statement = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM questions q WHERE ${where} LIMIT 1`);
  const row = await (isNumeric
    ? statement.bind(identifier, Number(identifier))
    : statement.bind(identifier)
  ).first();
  return row ? toPublicArchiveEntry(row as Parameters<typeof toPublicArchiveEntry>[0]) : null;
}

/**
 * Resolve a legacy numeric id to its canonical slug so old links 301 to the
 * descriptive URL instead of serving duplicate content.
 */
export async function resolveCanonicalSlug(db: D1Database, id: number): Promise<string | null> {
  const row = await db
    .prepare(`SELECT public_slug FROM questions WHERE id = ?1 AND is_public = 1`)
    .bind(id)
    .first<{ public_slug: string | null }>();
  return row?.public_slug ?? null;
}

export async function findRelated(
  db: D1Database,
  options: { excludeId: number; category: string | null; limit: number },
): Promise<PublicArchiveEntry[]> {
  const params: unknown[] = [options.excludeId];
  let where = "q.is_public = 1 AND q.id <> ?";
  if (options.category) {
    where += " AND q.category = ?";
    params.push(options.category);
  }
  const rows = await db
    .prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM questions q WHERE ${where}
        ORDER BY q.published_at DESC LIMIT ?`,
    )
    .bind(...params, options.limit)
    .all();
  return rows.results.map((r) => toPublicArchiveEntry(r as Parameters<typeof toPublicArchiveEntry>[0]));
}

/** Newest published answers, for the homepage and the RSS feed. */
export async function latestPublished(db: D1Database, limit: number): Promise<PublicArchiveEntry[]> {
  const rows = await db
    .prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM questions q WHERE q.is_public = 1
        ORDER BY q.published_at DESC, q.id DESC LIMIT ?`,
    )
    .bind(limit)
    .all();
  return rows.results.map((r) => toPublicArchiveEntry(r as Parameters<typeof toPublicArchiveEntry>[0]));
}

/** URL list for the sitemap: slug + lastmod for every published answer. */
export async function sitemapEntries(db: D1Database): Promise<{ slug: string; lastmod: number }[]> {
  const rows = await db
    .prepare(
      `SELECT public_slug AS slug, COALESCE(published_at, updated_at) AS lastmod
         FROM questions WHERE is_public = 1
        ORDER BY COALESCE(published_at, updated_at) DESC LIMIT 5000`,
    )
    .all<{ slug: string | null; lastmod: number }>();
  return rows.results
    .filter((r): r is { slug: string; lastmod: number } => typeof r.slug === "string" && r.slug.length > 0)
    .map((r) => ({ slug: r.slug, lastmod: r.lastmod }));
}

/**
 * Verify the external-content FTS index still agrees with the table.
 *
 * External content tables are the one SQLite structure that can silently drift,
 * so the maintenance cron runs FTS5's own integrity check and rebuilds if it
 * fails. Run manually with: `wrangler d1 execute ... --command="INSERT INTO
 * archive_fts(archive_fts) VALUES('rebuild')"`.
 */
export async function checkFtsIntegrity(db: D1Database): Promise<boolean> {
  try {
    await db.prepare(`INSERT INTO archive_fts(archive_fts) VALUES('integrity-check')`).run();
    return true;
  } catch {
    return false;
  }
}

export async function rebuildFtsIndex(db: D1Database): Promise<void> {
  await db.prepare(`INSERT INTO archive_fts(archive_fts) VALUES('rebuild')`).run();
}
