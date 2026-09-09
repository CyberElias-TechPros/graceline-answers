import { useEffect } from 'react';

const SITE_NAME = 'GraceLine Answers';
// Optional build-time override. The server sets the authoritative canonical/OG URLs
// for public pages; the client only mirrors them when an explicit base URL is provided
// (so it never fights the server-injected tags with a placeholder).
const CONFIGURED_BASE = (import.meta.env.VITE_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Client-side page metadata. The server injects the authoritative per-page meta/JSON-LD
 * for public pages (see server/seo-render.js); this hook keeps the in-browser title and
 * description in sync as users navigate and ensures admin/private pages stay noindex.
 */
export function useSeo({ title, description, canonicalPath, noindex } = {}) {
  const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Anonymous Bible Q&A and Christian Counseling`;

  useEffect(() => {
    document.title = fullTitle;
    setMeta('name', 'description', description || '');

    const base = CONFIGURED_BASE || window.location.origin;
    if (canonicalPath) {
      setMeta('property', 'og:url', `${base}${canonicalPath}`);
    }
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description || '');
    setMeta('name', 'twitter:title', fullTitle);

    // Match the page's intended indexability. For public pages the server already
    // injected `index, follow`; for admin/thread pages it injected `noindex`. Keeping
    // this in sync on the client is harmless and correct in both cases.
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
  }, [fullTitle, description, canonicalPath, noindex]);
}

export { SITE_NAME };
