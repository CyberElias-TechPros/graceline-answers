import { Hono } from "hono";
import { CATEGORIES, categorySlug, CRISIS_BANNER, LIMITS, SITE_NAME, SITE_TAGLINE } from "../../../shared/site";
import { archiveRoutes } from "./archive";
import { prayerRoutes } from "./prayer";
import { threadRoutes } from "./threads";
import type { AppContext } from "../app";

/**
 * Public (unauthenticated) API surface.
 */
export function publicRoutes(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  /**
   * Client configuration.
   *
   * The frontend fetches this instead of hardcoding the taxonomy, so the
   * category list, limits and crisis copy can never drift between the two
   * packages. Cached hard — it changes only on deploy.
   */
  app.get("/meta", (c) => {
    c.header("cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return c.json({
      siteName: c.env.SITE_NAME ?? SITE_NAME,
      siteTagline: SITE_TAGLINE,
      categories: CATEGORIES.map((name) => ({ name, slug: categorySlug(name) })),
      limits: LIMITS,
      crisisBanner: CRISIS_BANNER,
    });
  });

  app.route("/", threadRoutes());
  app.route("/", archiveRoutes());
  app.route("/", prayerRoutes());

  return app;
}
