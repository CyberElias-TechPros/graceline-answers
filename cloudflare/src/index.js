/**
 * GraceLine Answers — Cloudflare Worker entry point.
 *
 * One Worker serves the entire product:
 *   - JSON API under /api (questions, messages, archive, admin, prayer)
 *   - SEO endpoints (robots.txt, sitemap.xml, feed.xml)
 *   - the built React SPA from static ASSETS, with per-route meta injection
 *
 * Bindings: DB (D1), KV (rate limiting), MAIL (Email API), ASSETS (static).
 */
import { json, error } from './respond.js';
import { handleQuestions } from './handlers/questions.js';
import { handleMessages } from './handlers/messages.js';
import { handleArchive } from './handlers/archive.js';
import { handleAdmin } from './handlers/admin.js';
import { handlePrayer } from './handlers/prayer.js';
import { handleStats } from './handlers/stats.js';
import { serveSpa, robotsTxt, sitemapXml, feedXml } from './seo.js';

function securityHeaders() {
  const headers = new Headers();
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('X-XSS-Protection', '0');
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  return headers;
}

async function withSecurity(res) {
  const headers = securityHeaders();
  const next = new Headers(res.headers);
  for (const [k, v] of headers.entries()) next.set(k, v);
  const rid = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  next.set('x-request-id', rid);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: next });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      // ---------- Health ----------
      if (url.pathname === '/api/health' && request.method === 'GET') {
        let dbOk = false;
        let kvOk = false;
        try {
          await env.DB.prepare('SELECT 1').first();
          dbOk = true;
        } catch {
          dbOk = false;
        }
        try {
          await env.KV.get('health');
          kvOk = true;
        } catch {
          kvOk = false;
        }
        return withSecurity(json({ ok: dbOk && kvOk, ts: Date.now(), services: { d1: dbOk, kv: kvOk } }));
      }

      // ---------- API ----------
      if (url.pathname.startsWith('/api/')) {
        const res =
          (await handleQuestions(request, env, env.DB, url)) ||
          (await handleMessages(request, env, env.DB, url)) ||
          (await handleArchive(request, env, env.DB, url)) ||
          (await handleAdmin(request, env, env.DB, url)) ||
          (await handlePrayer(request, env, env.DB, url)) ||
          (await handleStats(request, env, env.DB, url));
        if (res) return withSecurity(res);
        return withSecurity(error('not_found', 404));
      }

      // ---------- SEO ----------
      if (request.method === 'GET') {
        if (url.pathname === '/robots.txt') return withSecurity(robotsTxt(request, env));
        if (url.pathname === '/sitemap.xml') return withSecurity(await sitemapXml(request, env, env.DB));
        if (url.pathname === '/feed.xml') return withSecurity(await feedXml(request, env, env.DB));
      }

      // ---------- SPA + assets ----------
      const res = await serveSpa(request, env, env.DB, url);
      return withSecurity(res);
    } catch (e) {
      console.error(`[graceline-answers] ${request.method} ${url.pathname} ->`, e);
      return withSecurity(error('server_error', 500));
    }
  },
};
