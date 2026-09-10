import { describe, expect, it } from "vitest";
import { loginAdmin, request, submitQuestion, uniqueIp } from "./helpers";

/**
 * Crawler-facing documents.
 *
 * These are what a search engine actually reads first, so they are asserted as
 * documents rather than as data: correct content type, valid escaping, and no
 * private URL ever appearing in an index.
 */

async function publish(title: string, answer: string) {
  const admin = await loginAdmin();
  const { id } = await submitQuestion({ title });
  const result = await request<{ slug: string | null }>(`/api/admin/questions/${id}/publish`, {
    method: "POST",
    ip: uniqueIp(),
    jar: admin.jar,
    csrf: admin.csrf,
    body: {
      is_public: true,
      public_title: title,
      public_content: `${title}? A seeker asked this in their own words.`,
      public_answer: answer,
      category: "Anxiety",
    },
  });
  return { id, slug: result.body?.slug ?? null, admin };
}

describe("robots.txt", () => {
  it("allows public content and excludes private areas", async () => {
    const result = await request("/api/seo/robots.txt", { ip: uniqueIp() });
    expect(result.status).toBe(200);
    expect(result.response.headers.get("content-type")).toContain("text/plain");
    expect(result.text).toContain("Allow: /");
    expect(result.text).toContain("Disallow: /t/");
    expect(result.text).toContain("Disallow: /admin");
    expect(result.text).toContain("Disallow: /api/");
    expect(result.text).toContain("Sitemap: https://graceline.test/sitemap.xml");
  });
});

describe("sitemap.xml", () => {
  it("lists the public pages and every published answer", async () => {
    const { slug } = await publish("What should I do when I feel afraid?", "Fear is met with presence, not panic.");

    const result = await request("/api/seo/sitemap.xml", { ip: uniqueIp() });
    expect(result.status).toBe(200);
    expect(result.response.headers.get("content-type")).toContain("application/xml");
    expect(result.text).toContain("<loc>https://graceline.test/</loc>");
    expect(result.text).toContain("<loc>https://graceline.test/ask</loc>");
    expect(result.text).toContain("<loc>https://graceline.test/archive</loc>");
    expect(result.text).toContain(`<loc>https://graceline.test/archive/${slug}</loc>`);
    // The category has published answers, so its landing page earns a URL.
    expect(result.text).toContain("<loc>https://graceline.test/archive/category/anxiety</loc>");
  });

  it("never lists a private thread or the console", async () => {
    const { token } = await submitQuestion({ title: "A private question" });
    const result = await request("/api/seo/sitemap.xml", { ip: uniqueIp() });
    expect(result.text).not.toContain(token);
    expect(result.text).not.toContain("/admin");
    expect(result.text).not.toContain("/t/");
  });

  it("omits categories that have nothing published", async () => {
    const result = await request("/api/seo/sitemap.xml", { ip: uniqueIp() });
    expect(result.text).not.toContain("/archive/category/career");
  });

  it("escapes characters that would break XML", async () => {
    await publish("Grace & mercy: what do they mean <really>?", "They mean more than we can earn.");
    const result = await request("/api/seo/sitemap.xml", { ip: uniqueIp() });
    // Slugs are already URL-safe, but the document as a whole must stay parseable.
    expect(result.text.startsWith("<?xml")).toBe(true);
    expect(result.text.trimEnd().endsWith("</urlset>")).toBe(true);
    expect(result.text).not.toContain("<really>");
  });
});

describe("feed.xml", () => {
  it("is valid RSS describing the published answers", async () => {
    const { slug } = await publish("How do I pray when I have no words?", "Silence is still prayer.");

    const result = await request("/api/seo/feed.xml", { ip: uniqueIp() });
    expect(result.status).toBe(200);
    expect(result.response.headers.get("content-type")).toContain("rss+xml");
    expect(result.text).toContain("<rss version=\"2.0\"");
    expect(result.text).toContain("xmlns:atom");
    expect(result.text).toContain(`https://graceline.test/archive/${slug}`);
    expect(result.text).toContain("<guid isPermaLink=\"true\">");
    expect(result.text.trimEnd().endsWith("</rss>")).toBe(true);
  });

  it("escapes ampersands and angle brackets in titles", async () => {
    await publish("Law & Gospel <explained>", "Both are needed, in that order.");
    const result = await request("/api/seo/feed.xml", { ip: uniqueIp() });
    expect(result.text).toContain("Law &amp; Gospel &lt;explained&gt;");
    expect(result.text).not.toContain("<explained>");
  });
});

describe("SEO data endpoints", () => {
  it("reports category counts for the archive index", async () => {
    await publish("A question about anxious thoughts", "Bring the thought into the light.");
    const result = await request<{ categories: { name: string; slug: string; count: number }[] }>(
      "/api/seo/category-index",
      { ip: uniqueIp() },
    );
    expect(result.status).toBe(200);
    const anxiety = result.body?.categories.find((c) => c.slug === "anxiety");
    expect(anxiety?.count).toBeGreaterThanOrEqual(1);
  });

  it("reports the published-answer count for the homepage", async () => {
    await publish("Another answered question", "Another careful answer.");
    const result = await request<{ publishedAnswers: number }>("/api/seo/site-stats", { ip: uniqueIp() });
    expect(result.body?.publishedAnswers).toBeGreaterThanOrEqual(1);
  });
});

describe("category filtering", () => {
  /**
   * The archive accepts a category either as the canonical display name or as
   * the slug that appears in public URLs. This used to accept only the name,
   * which made every slug-form request a 422 — and slug form is what callers
   * actually have, since it is what the sitemap and the category pages use.
   */
  it("accepts the canonical name and the URL slug identically", async () => {
    await publish("A question about anxious thoughts", "Bring the thought into the light.");

    const byName = await request<{ total: number; category: string | null }>(
      "/api/archive?category=Anxiety",
      { ip: uniqueIp() },
    );
    const bySlug = await request<{ total: number; category: string | null }>(
      "/api/archive?category=anxiety",
      { ip: uniqueIp() },
    );

    expect(byName.status).toBe(200);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body?.total).toBe(byName.body?.total);
    // Both normalise to the canonical name stored in the database.
    expect(bySlug.body?.category).toBe("Anxiety");
    expect(byName.body?.category).toBe("Anxiety");
  });

  it("treats an unknown category as an empty result, not a client error", async () => {
    const result = await request<{ total: number; items: unknown[] }>("/api/archive?category=nonsense", {
      ip: uniqueIp(),
    });
    // A filter that matches nothing is a normal outcome on a public read
    // endpoint, not something worth a 422.
    expect(result.status).toBe(200);
    expect(result.body?.total).toBe(0);
    expect(result.body?.items).toEqual([]);
  });

  it("combines a category filter with full-text search", async () => {
    await publish("Anxious about tomorrow", "Tomorrow has its own mercies.");
    const result = await request<{ items: { category: string | null }[] }>(
      "/api/archive?q=anxious&category=anxiety",
      { ip: uniqueIp() },
    );
    expect(result.status).toBe(200);
    expect(result.body?.items.length).toBeGreaterThan(0);
    for (const item of result.body?.items ?? []) {
      expect(item.category).toBe("Anxiety");
    }
  });
});

describe("submission response contract", () => {
  it("returns camelCase, like every other public response", async () => {
    /**
     * This endpoint briefly returned snake_case (`tracking_token`) while the
     * rest of the API used camelCase. The first client written against the
     * documented shape read `trackingToken`, got undefined, and redirected the
     * seeker to `/t/undefined` — losing access to their own thread. Pinning the
     * shape here so the two sides cannot drift again.
     */
    const result = await submitQuestion({ title: "Contract check" });
    expect(result.token).toBeTruthy();
    expect(result.token.length).toBeGreaterThanOrEqual(30);

    const raw = await request<Record<string, unknown>>("/api/questions", {
      method: "POST",
      ip: uniqueIp(),
      body: {
        title: "Contract check two",
        content: "Confirming the response uses camelCase keys throughout.",
      },
    });
    expect(Object.keys(raw.body ?? {}).sort()).toEqual([
      "crisis",
      "disclaimer",
      "id",
      "threadUrl",
      "trackingToken",
    ]);
    expect(raw.body?.tracking_token).toBeUndefined();
    expect(raw.body?.threadUrl).toBe(`/t/${raw.body?.trackingToken}`);
  });
});
