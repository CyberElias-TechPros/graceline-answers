'use strict';

const express = require('express');
const db = require('../db');
const { SITE_NAME, SITE_URL, DEFAULT_DESCRIPTION } = require('../config');

const router = express.Router();

const xmlEscape = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const abs = (path) => `${SITE_URL.replace(/\/$/, '')}${path}`;

// robots.txt — allow crawling of public content, keep admin/private out.
router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    [
      `User-agent: *`,
      `Allow: /`,
      `Disallow: /admin`,
      `Disallow: /api/`,
      `Sitemap: ${abs('/sitemap.xml')}`,
      '',
    ].join('\n'),
  );
});

// XML sitemap — public pages plus every published archive entry.
router.get('/sitemap.xml', (req, res) => {
  const publicPages = ['/', '/archive', '/prayer'];
  const published = db
    .prepare(
      `SELECT id, public_title AS title, public_answer AS answer, updated_at
         FROM questions WHERE is_public = 1 ORDER BY updated_at DESC`,
    )
    .all();

  const urls = [];
  for (const p of publicPages) {
    urls.push({
      loc: abs(p),
      lastmod: new Date().toISOString().slice(0, 10),
      changefreq: p === '/' ? 'weekly' : 'daily',
      priority: p === '/' ? '1.0' : '0.8',
    });
  }
  for (const item of published) {
    urls.push({
      loc: abs(`/archive/${encodeURIComponent(item.id)}`),
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
  res.type('application/xml').send(body);
});

// RSS feed of published Q&A — a cheap, legitimate content-distribution channel.
router.get('/feed.xml', (req, res) => {
  const published = db
    .prepare(
      `SELECT id, public_title AS title, public_content AS content, public_answer AS answer,
              category, created_at, updated_at
         FROM questions WHERE is_public = 1 ORDER BY updated_at DESC LIMIT 50`,
    )
    .all();

  const items = published
    .map(
      (p) => `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${xmlEscape(abs(`/archive/${p.id}`))}</link>
      <guid isPermaLink="true">${xmlEscape(abs(`/archive/${p.id}`))}</guid>
      <pubDate>${new Date(p.updated_at).toUTCString()}</pubDate>
      <description>${xmlEscape(p.content || '')}</description>
    </item>`,
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(SITE_NAME)}</title>
    <link>${xmlEscape(SITE_URL)}</link>
    <description>${xmlEscape(DEFAULT_DESCRIPTION)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
  res.type('application/rss+xml').send(body);
});

module.exports = router;
