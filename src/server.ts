import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { resolveApiOrigin } from "./lib/api-origin";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/* --------------------------------------------------------------------------
 * API proxy
 *
 * The API is a Cloudflare Worker on a different origin. Proxying it here rather
 * than calling it directly from the browser buys three things:
 *
 *   1. Cookies stay first-party, so the session cookie can use SameSite=Lax and
 *      the CSRF double-submit check works without any CORS configuration.
 *   2. No API origin is exposed to the client bundle.
 *   3. /robots.txt, /sitemap.xml and /feed.xml are served on the site's own
 *      origin, which a sitemap is required to be.
 *
 * The target comes from the environment, so preview deployments talk to a
 * preview Worker and production talks to production — nothing is hardcoded.
 * ------------------------------------------------------------------------ */

/** Paths served by the Worker at a different path than the browser requests. */
const DOCUMENT_ROUTES: Record<string, string> = {
  "/robots.txt": "/api/seo/robots.txt",
  "/sitemap.xml": "/api/seo/sitemap.xml",
  "/feed.xml": "/api/seo/feed.xml",
};

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

// Shared with the SSR loaders so the proxy and the loaders always agree about
// where the Worker is. Divergence here silently emptied every server-rendered
// page once already.
function apiOrigin(): string {
  return resolveApiOrigin();
}

function upstreamPath(pathname: string): string | null {
  if (pathname === "/api" || pathname.startsWith("/api/")) return pathname;
  return DOCUMENT_ROUTES[pathname] ?? null;
}

async function proxyToApi(request: Request, pathname: string): Promise<Response> {
  const target = upstreamPath(pathname);
  if (!target) throw new Error(`no upstream for ${pathname}`);

  const url = new URL(request.url);
  const destination = `${apiOrigin()}${target}${url.search}`;

  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  }
  // The Worker must see the real client address for rate limiting.
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(destination, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // @ts-expect-error -- duplex is required by the WHATWG spec to stream a
    // request body, and is accepted by the Workers runtime and by Node.
    duplex: hasBody ? "half" : undefined,
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) responseHeaders.append(key, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** JSON 502 so an API outage is distinguishable from a rendering failure. */
function apiUnavailable(cause: unknown): Response {
  console.error("[graceline] api proxy failure:", cause);
  return new Response(
    JSON.stringify({
      error: "service_unavailable",
      message: "We could not reach the service just now. Please try again in a moment.",
    }),
    { status: 502, headers: { "content-type": "application/json; charset=utf-8" } },
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const pathname = new URL(request.url).pathname;

    if (upstreamPath(pathname)) {
      try {
        return await proxyToApi(request, pathname);
      } catch (error) {
        return apiUnavailable(error);
      }
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
