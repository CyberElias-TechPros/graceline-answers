import { Hono } from "hono";
import { AppError } from "./lib/errors";
import { corsHeaders, errorResponse, securityHeaders } from "./lib/http";
import { logger, newRequestId, redact } from "./lib/logging";
import { attachUser } from "./middleware/auth";
import { publicRoutes } from "./routes/public";
import { adminRoutes } from "./routes/admin";
import { seoXmlRoutes } from "./routes/seo";
import type { Env, PublicUser } from "./types";

/**
 * Application composition root.
 */

export type AppContext = {
  Bindings: Env;
  Variables: {
    requestId: string;
    user: PublicUser | null;
  };
};

const MAX_BODY_BYTES = 64 * 1024;

export function createApp(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  // --- Request identity + security headers ---------------------------------
  app.use("*", async (c, next) => {
    const requestId = newRequestId(c.req.header("x-request-id"));
    c.set("requestId", requestId);
    c.set("user", null);

    const started = Date.now();
    await next();

    const status = c.res.status;
    // `new Headers(existing)` collapses repeated headers, which would silently
    // merge our two Set-Cookie values into one unusable header. Capture them
    // separately and re-append, since `append` preserves distinct entries.
    const cookies = c.res.headers.getSetCookie();
    const headers = new Headers(c.res.headers);
    headers.delete("set-cookie");
    for (const cookie of cookies) headers.append("set-cookie", cookie);

    for (const [key, value] of Object.entries(securityHeaders(c.env))) {
      if (key === "x-request-id") headers.set(key, requestId);
      else if (!headers.has(key)) headers.set(key, value);
    }
    for (const [key, value] of Object.entries(corsHeaders(c.req.raw, c.env))) {
      headers.set(key, value);
    }
    // Never let an intermediary cache a personalized API response.
    if (!headers.has("cache-control")) headers.set("cache-control", "no-store");

    const url = new URL(c.req.url);
    logger.info("request", {
      request_id: requestId,
      method: c.req.method,
      path: url.pathname,
      status,
      duration_ms: Date.now() - started,
    });

    c.res = new Response(c.res.body, { status: c.res.status, statusText: c.res.statusText, headers });
  });

  // --- CORS preflight -------------------------------------------------------
  app.options("*", (c) => new Response(null, { status: 204 }));

  // --- Body size guard (applies before any route reads the body) ------------
  app.use("*", async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next();
    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) {
      throw new AppError("payload_too_large", "That message is longer than we can accept.");
    }
    return next();
  });

  // --- Authentication context (resolves the counselor, never throws) --------
  app.use("*", attachUser);

  // --- Health ---------------------------------------------------------------
  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      service: "graceline-api",
      environment: c.env.ENVIRONMENT ?? "development",
      ts: Date.now(),
    }),
  );

  // --- Feature routes -------------------------------------------------------
  app.route("/api", publicRoutes());
  // Crawler documents. Vercel rewrites /robots.txt, /sitemap.xml and /feed.xml
  // to these paths so the browser still sees them on the site's own origin.
  app.route("/api", seoXmlRoutes());
  app.route("/api/admin", adminRoutes());

  // --- Unknown API route: JSON 404, never the SPA shell ---------------------
  app.all("/api/*", (c) => {
    throw AppError.notFound("That API endpoint does not exist.");
  });

  // Anything outside /api is the frontend's job (Vercel serves it).
  app.notFound((c) => c.json({ error: "not_found", message: "Not found" }, 404));

  app.onError((error, c) => {
    const requestId = c.get("requestId");
    if (!(error instanceof AppError)) {
      logger.error("unhandled", {
        request_id: requestId,
        path: new URL(c.req.url).pathname,
        detail: redact(error instanceof Error ? { message: error.message } : { value: String(error) }) as never,
      });
    }
    return errorResponse(error, requestId);
  });

  return app;
}
