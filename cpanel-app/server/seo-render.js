'use strict';

const db = require('./db');
const { SITE_NAME, SITE_URL, DEFAULT_DESCRIPTION } = require('./config');

const abs = (path) => `${SITE_URL.replace(/\/$/, '')}${path}`;

const xmlEscape = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const htmlEscape = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

function buildJsonLd(pathname) {
  if (pathname === '/' ) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: abs('/'),
      description: DEFAULT_DESCRIPTION,
      slogan: 'Anonymous Bible Q&A and faith-centered Christian counseling.',
    };
  }
  const archiveMatch = pathname.match(/^\/archive\/(\d+)$/);
  if (archiveMatch) {
    const id = Number(archiveMatch[1]);
    const row = db
      .prepare(
        `SELECT public_title AS title, public_content AS content, public_answer AS answer,
                category, created_at FROM questions WHERE id = ? AND is_public = 1`,
      )
      .get(id);
    if (row) {
      return [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: abs('/') },
            { '@type': 'ListItem', position: 2, name: 'Archive', item: abs('/archive') },
            { '@type': 'ListItem', position: 3, name: row.title, item: abs(`/archive/${id}`) },
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
            acceptedAnswer: {
              '@type': 'Answer',
              text: row.answer,
            },
          },
        },
      ];
    }
  }
  return null;
}

/**
 * Inject title/description/OG/Twitter/JSON-LD into the SPA's index.html for the
 * given pathname. Only public pages get real meta; admin/private routes get noindex
 * so they never clutter the index. This gives crawlers correct signals without
 * requiring a full SSR framework.
 */
function renderSpaHtml(indexHtml, pathname) {
  let title = `${SITE_NAME} — Anonymous Bible Q&A and Christian Counseling`;
  let description = DEFAULT_DESCRIPTION;
  let canonical = abs('/');
  let noindex = false;

  const path = (pathname || '/').split('?')[0];
  const meta = PAGE_META[path];

  if (path.startsWith('/admin') || path.startsWith('/t/')) {
    noindex = true;
    title = 'GraceLine Answers';
    description = '';
  }

  const archiveMatch = path.match(/^\/archive\/(\d+)$/);
  if (archiveMatch) {
    const row = db
      .prepare(
        `SELECT public_title AS title, public_content AS content FROM questions
         WHERE id = ? AND is_public = 1`,
      )
      .get(Number(archiveMatch[1]));
    if (row) {
      title = row.title;
      description = (row.content || '').slice(0, 160);
      canonical = abs(`/archive/${archiveMatch[1]}`);
    } else {
      noindex = true;
    }
  } else if (path === '/' || path === '/ask' || path === '/archive' || path === '/prayer') {
    if (meta) {
      title = meta.title;
      description = meta.description;
    }
    canonical = abs(path);
  }

  const jsonLd = buildJsonLd(path);
  const jsonLdScript = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : '';

  const injected = [
    `<meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow'}" />`,
    `<meta name="description" content="${htmlEscape(description)}" />`,
    `<link rel="canonical" href="${htmlEscape(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${htmlEscape(SITE_NAME)}" />`,
    `<meta property="og:title" content="${htmlEscape(title)}" />`,
    `<meta property="og:description" content="${htmlEscape(description)}" />`,
    `<meta property="og:url" content="${htmlEscape(canonical)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${htmlEscape(title)}" />`,
    `<meta name="twitter:description" content="${htmlEscape(description)}" />`,
    jsonLdScript,
  ].join('\n    ');

  let html = indexHtml;
  // Replace the static <title> with the route-specific one.
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${htmlEscape(title)}</title>`);
  // Remove any pre-existing base meta that we are about to inject fresh, so we never
  // produce duplicate description/robots/canonical tags.
  html = html
    .replace(/<meta\s+name=["']robots["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  // Inject canonical/OG/Twitter/JSON-LD right after the closing title tag.
  html = html.replace('</title>', `</title>\n    ${injected}`);
  return html;
}

module.exports = { renderSpaHtml };
