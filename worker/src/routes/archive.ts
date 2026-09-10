import { Hono } from "hono";
import { CATEGORIES, categoryFromSlug, categorySlug } from "../../../shared/site";
import { AppError } from "../lib/errors";
import { RULES } from "../lib/ratelimit";
import { rateLimit } from "../middleware/ratelimit";
import {
  categoryCounts,
  countArchive,
  findPublishedBySlugOrId,
  findRelated,
  latestPublished,
  listArchive,
  resolveCanonicalSlug,
  searchArchive,
} from "../db/archive";
import { archiveQuerySchema, parse } from "../lib/validation";
import type { AppContext } from "../app";

/**
 * The public archive: published, hand-anonymized answers.
 *
 * Every read here is filtered to `is_public = 1` inside the repository, so a
 * handler mistake cannot expose raw seeker text.
 */
export function archiveRoutes(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  /**
   * Normalise a category filter to the canonical name stored in the database.
   *
   * Accepts the display name or its URL slug. A value that matches neither is
   * passed through unchanged, which simply matches nothing — an unknown filter
   * on a public read endpoint is an empty result, not a client error.
   */
  function resolveCategory(value: string | undefined): string | null {
    if (!value) return null;
    if ((CATEGORIES as readonly string[]).includes(value)) return value;
    return categoryFromSlug(value) ?? value;
  }

  app.get(
    "/archive",
    rateLimit(RULES.archiveSearch),
    async (c) => {
      const query = parse(archiveQuerySchema, {
        q: c.req.query("q") ?? undefined,
        category: c.req.query("category") ?? undefined,
        limit: c.req.query("limit") ?? undefined,
        cursor: c.req.query("cursor") ?? undefined,
      });

      const category = resolveCategory(query.category);

      const page = query.q
        ? await searchArchive(c.env.DB, {
            query: query.q,
            category,
            limit: query.limit,
            cursor: query.cursor ?? null,
          })
        : await listArchive(c.env.DB, { category, limit: query.limit, cursor: query.cursor ?? null });

      const total = await countArchive(c.env.DB, { category });

      // Public and cacheable: this is the endpoint behind the archive page.
      c.header("cache-control", query.q ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300");

      return c.json({
        items: page.items,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        total,
        query: query.q ?? null,
        category: category ?? null,
      });
    },
  );

  /** Category taxonomy plus live counts, so the UI never shows an empty facet. */
  app.get("/archive/categories", async (c) => {
    const counts = await categoryCounts(c.env.DB);
    c.header("cache-control", "public, s-maxage=300, stale-while-revalidate=600");
    return c.json({
      categories: CATEGORIES.map((name) => ({
        name,
        slug: categorySlug(name),
        count: counts[name] ?? 0,
      })),
    });
  });

  /** Newest answers, for the homepage. */
  app.get("/archive/latest", async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 4), 1), 12);
    const items = await latestPublished(c.env.DB, limit);
    c.header("cache-control", "public, s-maxage=120, stale-while-revalidate=600");
    return c.json({ items });
  });

  /** One published answer, addressed by its canonical slug. */
  app.get("/archive/:identifier", async (c) => {
    const identifier = c.req.param("identifier");
    if (identifier === "categories" || identifier === "latest") return c.notFound();

    const entry = await findPublishedBySlugOrId(c.env.DB, identifier);
    if (!entry) throw AppError.notFound("That answer is not in the archive.");

    // A numeric id still resolves (old links, emails) but must redirect to the
    // canonical slug so the same answer is never indexed twice.
    if (/^\d+$/.test(identifier) && entry.slug !== identifier) {
      const canonical = await resolveCanonicalSlug(c.env.DB, Number(identifier));
      if (canonical) {
        return c.json({ redirect: `/archive/${canonical}`, entry }, 301);
      }
    }

    const related = await findRelated(c.env.DB, {
      excludeId: entry.id,
      category: entry.category,
      limit: 4,
    });

    c.header("cache-control", "public, s-maxage=300, stale-while-revalidate=1800");
    return c.json({ entry, related });
  });

  return app;
}
