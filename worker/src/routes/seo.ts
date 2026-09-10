import { Hono } from "hono";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_TAGLINE, excerpt } from "../../../shared/site";
import { categoryCounts, latestPublished, sitemapEntries } from "../db/archive";
import { categorySlug } from "../../../shared/site";
import type { AppContext } from "../app";

/**
 * Crawler-facing documents.
 *
 * These live on the Worker rather than the frontend for one reason: a sitemap
 * must list absolute URLs on the same host that serves it, and the Worker owns
 * `PUBLIC_SITE_URL` — the single source of truth for the canonical origin.
 * Generating them anywhere else would mean duplicating that value and hoping
 * the two copies never drift.
 *
 * Vercel rewrites `/robots.txt`, `/sitemap.xml` and `/feed.xml` here, so the
 * browser still sees them on the site's own origin.
 */
export function seoXmlRoutes(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  const siteUrl = (env: { PUBLIC_SITE_URL?: string }) => (env.PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const abs = (base: string, path: string) => `${base}${path}`;

  app.get("/seo/robots.txt", (c) => {
    const base = siteUrl(c.env);
    const body = [
      "# GraceLine Answers",
      "User-agent: *",
      "Allow: /",
      "",
      "# Private conversations and the counselor console must never be indexed.",
      "Disallow: /t/",
      "Disallow: /admin",
      "Disallow: /api/",
      "",
      `Sitemap: ${abs(base, "/sitemap.xml")}`,
      "",
    ].join("\n");

    c.header("content-type", "text/plain; charset=utf-8");
    c.header("cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return c.body(body);
  });

  app.get("/seo/sitemap.xml", async (c) => {
    const base = siteUrl(c.env);
    const [entries, counts] = await Promise.all([sitemapEntries(c.env.DB), categoryCounts(c.env.DB)]);

    type Url = { loc: string; lastmod?: string; changefreq: string; priority: string };
    const today = new Date().toISOString().slice(0, 10);
    const urls: Url[] = [
      { loc: abs(base, "/"), lastmod: today, changefreq: "weekly", priority: "1.0" },
      { loc: abs(base, "/ask"), changefreq: "monthly", priority: "0.9" },
      { loc: abs(base, "/archive"), lastmod: today, changefreq: "daily", priority: "0.9" },
      { loc: abs(base, "/prayer"), changefreq: "daily", priority: "0.7" },
      { loc: abs(base, "/about"), changefreq: "monthly", priority: "0.6" },
      { loc: abs(base, "/privacy"), changefreq: "yearly", priority: "0.4" },
    ];

    // Only categories that actually have published answers get a URL. Emitting
    // empty category pages would be thin content, which is worse than nothing.
    for (const [category, count] of Object.entries(counts)) {
      if (count > 0) {
        urls.push({
          loc: abs(base, `/archive/category/${categorySlug(category)}`),
          changefreq: "weekly",
          priority: "0.7",
        });
      }
    }

    for (const entry of entries) {
      urls.push({
        loc: abs(base, `/archive/${entry.slug}`),
        lastmod: new Date(entry.lastmod).toISOString().slice(0, 10),
        changefreq: "monthly",
        priority: "0.8",
      });
    }

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) =>
      `  <url>\n    <loc>${xml(url.loc)}</loc>${url.lastmod ? `\n    <lastmod>${url.lastmod}</lastmod>` : ""}\n    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;

    c.header("content-type", "application/xml; charset=utf-8");
    c.header("cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return c.body(body);
  });

  app.get("/seo/feed.xml", async (c) => {
    const base = siteUrl(c.env);
    const items = await latestPublished(c.env.DB, 30);

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(`${SITE_NAME} — answered questions`)}</title>
    <link>${xml(base)}</link>
    <description>${xml(DEFAULT_DESCRIPTION)}</description>
    <language>en-gb</language>
    <atom:link href="${xml(abs(base, "/feed.xml"))}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items
  .map((item) => {
    const link = abs(base, `/archive/${item.slug}`);
    return `    <item>
      <title>${xml(item.title)}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="true">${xml(link)}</guid>
      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
      ${item.category ? `<category>${xml(item.category)}</category>` : ""}
      <description>${xml(excerpt(item.content, 400))}</description>
    </item>`;
  })
  .join("\n")}
  </channel>
</rss>
`;

    c.header("content-type", "application/rss+xml; charset=utf-8");
    c.header("cache-control", "public, s-maxage=1800, stale-while-revalidate=3600");
    return c.body(body);
  });

  /** Small JSON summary the homepage uses for live counts. */
  app.get("/seo/site-stats", async (c) => {
    const entries = await sitemapEntries(c.env.DB);
    c.header("cache-control", "public, s-maxage=1800, stale-while-revalidate=86400");
    return c.json({ publishedAnswers: entries.length, tagline: SITE_TAGLINE });
  });

  /** Category index with live counts, for the archive page and homepage. */
  app.get("/seo/category-index", async (c) => {
    const counts = await categoryCounts(c.env.DB);
    c.header("cache-control", "public, s-maxage=900, stale-while-revalidate=3600");
    return c.json({
      categories: Object.entries(counts)
        .map(([name, count]) => ({ name, slug: categorySlug(name), count }))
        .sort((a, b) => b.count - a.count),
    });
  });

  return app;
}

function xml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Control characters are illegal in XML 1.0 even when escaped.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}
