# 0008 — Public pages server-rendered; structured data in the first HTML

**Status:** Accepted

## Context
The archive and answer pages are the SEO surface. If content, canonicals or JSON-LD were added
by client-side JavaScript, a crawler's first pass could miss them.

## Decision
Server-render every indexable page. Titles, descriptions, canonicals, robots directives and
JSON-LD (WebSite, Organization, CollectionPage, BreadcrumbList, QAPage, FAQPage) are emitted in
the server HTML. Search results pages are `noindex` and self-canonicalising.

## Consequences
- Crawlers see complete content without executing JS.
- noindex + self-canonical avoids the contradiction of noindexing a page that canonicalises
  elsewhere (which can cause the noindex to be dropped).
- Loaders must degrade gracefully when the API is unavailable, so the site never renders a
  broken shell.
