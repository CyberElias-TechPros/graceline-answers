/**
 * Per-route SEO for the SPA served from Cloudflare static assets.
 *
 * Ports cpanel-app/server/seo-render.js: the Worker fetches index.html from
 * the ASSETS binding and injects route-specific <title>, description,
 * canonical, Open Graph / Twitter tags and JSON-LD before returning it.
 * Admin and private thread routes are noindexed.
 */
import { siteConfig } from './config.js';
import { escapeHtml, xmlEscape } from './util.js';

const PAGE_META = {
  '/': {
    title: 'Anonymous Bible Q&A and Christian Counseling',
    description:
      'Ask Bible and life questions anonymously. Receive scripture-based counsel from real pastors. Browse a searchable archive of answered questions.',
  },
  '/ask': {
    title: 'Ask a Question',
    description:
      'Ask Bible and life questions anonymously. Receive scripture-based counsel from real pastors. Your privacy is protected — we never log your IP.',
  },
  '/archive': {
    title: 'Answered Questions Archive',
    description:
      'Browse a searchable archive of anonymized answers from real conversations — Bible Q&A and faith-centered counsel.',
  },
  '/prayer': {
    title: 'Prayer Wall',
    description:
      'Share a need anonymously and let others stand with you in prayer. A quiet reminder that you are not alone.',
  },
};

function baseFrom(env, request) {
  const cfg = siteConfig(env);
  if (cfg.publicBase) return cfg.publicBase;
  try {
    return new URL(request.url).origin;
  } catch {
    return '';
  }
}

async function renderSpaHtml(request, env, db, indexHtml, pathname) {
  const cfg = siteConfig(env);
  const base = baseFrom(env, request);
  const abs = (p) => `${base}${p}`;

  let title = `${cfg.siteName} — Anonymous Bible Q&A and Christian Counseling`;
  let description = cfg.defaultDescription;
  let canonical = abs('/');
  let noindex = false;
  let jsonLd = null;

  const path = (pathname || '/').split('?')[0];

  if (path.startsWith('/admin') || path.startsWith('/t/')) {
    noindex = true;
    title = cfg.siteName;
    description = '';
  }

  const archiveMatch = path.match(/^\/archive\/(\d+)$/);
  if (archiveMatch) {
    const row = await db
      .prepare(
        `SELECT public_title AS title, public_content AS content, public_answer AS answer,
                category, created_at FROM questions WHERE id = ? AND is_public = 1`,
      )
      .bind(Number(archiveMatch[1]))
      .first();
    if (row) {
      title = row.title;
      description = (row.content || '').slice(0, 160);
      canonical = abs(`/archive/${archiveMatch[1]}`);
      jsonLd = [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: abs('/') },
            { '@type': 'ListItem', position: 2, name: 'Archive', item: abs('/archive') },
            { '@type': 'ListItem', position: 3, name: row.title, item: abs(`/archive/${archiveMatch[1]}`) },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'QAPage',
          mainEntity: {
            '@type': 'Question',
            name: row.title,
            text: row.content,
            answerCount: 1,
            acceptedAnswer: { '@type': 'Answer', text: row.answer },
          },
        },
      ];
    } else {
      noindex = true;
    }
  } else if (path === '/' || path === '/ask' || path === '/archive' || path === '/prayer') {
    const meta = PAGE_META[path];
    if (meta) {
      title = meta.title;
      description = meta.description;
    }
    canonical = abs(path);
    if (path === '/') {
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: cfg.siteName,
        url: abs('/'),
        description: cfg.defaultDescription,
        slogan: cfg.tagline,
      };
    }
  }

  const jsonLdScript = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : '';

  const injected = [
    `<meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow'}" />`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(cfg.siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    jsonLdScript,
  ]
    .filter(Boolean)
    .join('\n    ');

  let html = indexHtml;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html
    .replace(/<meta\s+name=["']robots["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  html = html.replace('</title>', `</title>\n    ${injected}`);
  return html;
}

/** Serve a built asset, or fall back to the meta-injected SPA shell. */
async function fetchShell(request, env) {
  const idxRequest = new Request(`${new URL(request.url).origin}/index.html`, {
    method: 'GET',
    headers: { accept: 'text/html' },
  });
  const idx = await env.ASSETS.fetch(idxRequest);
  return idx.text();
}

export async function serveSpa(request, env, db, url) {
  const path = url.pathname;
  const assetRes = await env.ASSETS.fetch(request);
  if (assetRes.status !== 404) {
    // The only HTML asset is the SPA shell (served for `/` and `/index.html`) —
    // inject per-route meta + JSON-LD into it. Everything else is a static file.
    const isShell = path === '/' || path === '/index.html';
    const headers = new Headers(assetRes.headers);
    if (isShell) {
      const html = await assetRes.text();
      const out = await renderSpaHtml(request, env, db, html, path === '/index.html' ? '/' : path);
      headers.set('Cache-Control', 'no-cache');
      headers.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(out, { status: 200, headers });
    }
    // Long-cache hashed build assets; never cache anything else.
    // (ASSETS responses have immutable headers — rebuild instead of mutating.)
    headers.set(
      'Cache-Control',
      path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
    return new Response(assetRes.body, { status: assetRes.status, headers });
  }
  // SPA history fallback: any unknown path gets the meta-injected shell.
  const html = await fetchShell(request, env);
  const out = await renderSpaHtml(request, env, db, html, path);
  return new Response(out, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}

// ------------------------------------------------- robots / sitemap / rss --

export function robotsTxt(request, env) {
  const base = baseFrom(env, request);
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export async function sitemapXml(request, env, db) {
  const base = baseFrom(env, request);
  const publicPages = ['/', '/archive', '/prayer'];
  const published = await db
    .prepare(
      `SELECT id, updated_at FROM questions WHERE is_public = 1 ORDER BY updated_at DESC`,
    )
    .all();
  const urls = [];
  for (const p of publicPages) {
    urls.push({
      loc: `${base}${p}`,
      lastmod: new Date().toISOString().slice(0, 10),
      changefreq: p === '/' ? 'weekly' : 'daily',
      priority: p === '/' ? '1.0' : '0.8',
    });
  }
  for (const item of published.results || []) {
    urls.push({
      loc: `${base}/archive/${encodeURIComponent(item.id)}`,
      lastmod: new Date(item.updated_at).toISOString().slice(0, 10),
      changefreq: 'monthly',
      priority: '0.7',
    });
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  )
  .join('\n')}
</urlset>`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}

export async function feedXml(request, env, db) {
  const cfg = siteConfig(env);
  const base = baseFrom(env, request);
  const published = await db
    .prepare(
      `SELECT id, public_title AS title, public_content AS content, public_answer AS answer,
              category, created_at, updated_at
         FROM questions WHERE is_public = 1 ORDER BY updated_at DESC LIMIT 50`,
    )
    .all();
  const items = (published.results || [])
    .map(
      (p) => `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${xmlEscape(`${base}/archive/${p.id}`)}</link>
      <guid isPermaLink="true">${xmlEscape(`${base}/archive/${p.id}`)}</guid>
      <pubDate>${new Date(p.updated_at).toUTCString()}</pubDate>
      <description>${xmlEscape(p.content || '')}</description>
    </item>`,
    )
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(cfg.siteName)}</title>
    <link>${xmlEscape(base)}</link>
    <description>${xmlEscape(cfg.defaultDescription)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
  return new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
}
