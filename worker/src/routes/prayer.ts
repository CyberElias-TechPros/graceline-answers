import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { clientIp } from "../lib/http";
import { RULES } from "../lib/ratelimit";
import { rateLimit } from "../middleware/ratelimit";
import { createPrayer, listPrayers, incrementPrayed } from "../db/prayer";
import { parse, parseIdParam, prayerQuerySchema } from "../lib/validation";
import { prayerSchema } from "../lib/validation";
import { detectCrisis, CRISIS_BANNER } from "../../../shared/site";
import type { AppContext } from "../app";

/**
 * Community prayer wall.
 *
 * Requests are anonymous — the schema has no author column at all, so the
 * promise "we do not know who asked" is structural rather than procedural.
 */
export function prayerRoutes(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  app.get("/prayer", async (c) => {
    const query = parse(prayerQuerySchema, {
      limit: c.req.query("limit") ?? undefined,
      cursor: c.req.query("cursor") ?? undefined,
    });
    const page = await listPrayers(c.env.DB, { limit: query.limit, cursor: query.cursor ?? null });
    c.header("cache-control", "public, s-maxage=30, stale-while-revalidate=120");
    return c.json(page);
  });

  app.post("/prayer", rateLimit(RULES.prayerSubmit), async (c) => {
    const body = parse(prayerSchema, await c.req.json().catch(() => ({})));
    const created = await createPrayer(c.env.DB, {
      title: body.title,
      content: body.content,
      now: Date.now(),
    });

    // A prayer request that mentions crisis gets the same resources surfaced as
    // a question would — someone in crisis may reach for the prayer wall first.
    const crisis = detectCrisis(`${body.title}\n${body.content}`);

    return c.json(
      {
        ...created,
        crisis: crisis.isCrisis ? { ...crisis, banner: CRISIS_BANNER } : { isCrisis: false, hits: [] },
      },
      201,
    );
  });

  app.post(
    "/prayer/:id/pray",
    rateLimit(RULES.prayerCount, { identityFor: (ctx) => `${clientIp(ctx.req.raw)}:${ctx.req.param("id")}` }),
    async (c) => {
      const id = parseIdParam(c.req.param("id"));
      const result = await incrementPrayed(c.env.DB, id);
      if (!result) throw AppError.notFound("That prayer request is no longer on the wall.");
      return c.json({ ok: true, prayedCount: result.prayedCount });
    },
  );

  return app;
}
