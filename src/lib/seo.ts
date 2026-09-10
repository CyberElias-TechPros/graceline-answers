import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_TAGLINE, excerpt } from "../../shared/site";
import { SITE_URL } from "./api";
import type { PublicArchiveEntry } from "./api";

/**
 * SEO metadata.
 *
 * Every indexable page gets a unique title, description, canonical and Open
 * Graph set here, and structured data is emitted as JSON-LD in the server
 * render so it is present in the HTML a crawler first receives — never added by
 * client-side JavaScript.
 *
 * Titles follow one pattern so search results read as one brand:
 *   "<Page topic> · GraceLine Answers"  with the homepage carrying the primary
 *   keyword phrase on its own.
 */

const TITLE_SUFFIX = SITE_NAME;
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 158;

export type SeoInput = {
  title: string;
  description: string;
  /** Site-relative path, e.g. "/archive/grace-1". */
  path: string;
  noindex?: boolean;
  image?: string;
  imageAlt?: string;
};

export function pageTitle(title: string, { bare = false }: { bare?: boolean } = {}): string {
  if (bare) return title;
  const full = `${title} · ${TITLE_SUFFIX}`;
  return full.length <= TITLE_MAX ? full : `${title.slice(0, Math.max(0, TITLE_MAX - TITLE_SUFFIX.length - 3)).trimEnd()} · ${TITLE_SUFFIX}`;
}

export function pageDescription(description: string): string {
  return excerpt(description, DESCRIPTION_MAX);
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Build the full `meta` array for a route's `head()`. */
export function buildMeta(input: SeoInput) {
  const canonical = absoluteUrl(input.path);
  const description = pageDescription(input.description);
  const title = pageTitle(input.title);
  const image = input.image ? absoluteUrl(input.image) : absoluteUrl("/og-default.png");

  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: description },
    { name: "robots", content: input.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: canonical },
    { property: "og:image", content: image },
    { property: "og:image:alt", content: input.imageAlt ?? `${SITE_NAME} — ${SITE_TAGLINE}` },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];

  return { meta, canonical, title, description, image };
}

/**
 * Canonical + feed discovery links.
 *
 * A page marked `noindex` must self-canonicalise. Pointing a noindexed page at
 * an indexable one makes the two directives contradict each other, and a
 * canonical is strong enough that the noindex can be dropped — which would put
 * internal search results into the index.
 */
export function buildLinks(input: { path: string; feed?: boolean }) {
  const links: Record<string, string>[] = [{ rel: "canonical", href: absoluteUrl(input.path) }];
  if (input.feed !== false) {
    links.push({ rel: "alternate", type: "application/rss+xml", title: `${SITE_NAME} — recent answers`, href: absoluteUrl("/feed.xml") });
  }
  return links;
}

/** Metadata for a page that must never be indexed: private threads, the console. */
export function privateMeta(title: string, path: string) {
  return buildMeta({
    title,
    description: "This page is private and is not indexed by search engines.",
    path,
    noindex: true,
  });
}

/* --------------------------------------------------------------------------
 * Structured data
 * ------------------------------------------------------------------------ */

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "NGO",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    slogan: SITE_TAGLINE,
    areaServed: "Worldwide",
    knowsLanguage: "en",
    // No logo, address, phone or founder is invented here: fabricating entity
    // data is worse for trust than omitting it.
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en",
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/**
 * QAPage markup for a published answer.
 *
 * `upvoteCount` and author names are deliberately omitted — there is no voting
 * feature and answers are published anonymously, so claiming either would be
 * fabricating data.
 */
export function qaPageJsonLd(entry: PublicArchiveEntry) {
  return {
    "@context": "https://schema.org",
    "@type": "QAPage",
    "@id": absoluteUrl(`/archive/${entry.slug}`),
    mainEntity: {
      "@type": "Question",
      name: entry.title,
      text: entry.content,
      answerCount: 1,
      dateCreated: new Date(entry.publishedAt).toISOString(),
      inLanguage: "en",
      ...(entry.category ? { about: { "@type": "Thing", name: entry.category } } : {}),
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
        dateCreated: new Date(entry.publishedAt).toISOString(),
        inLanguage: "en",
      },
    },
  };
}

export function collectionPageJsonLd(name: string, description: string, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": absoluteUrl(path),
    name,
    description,
    url: absoluteUrl(path),
    isPartOf: { "@id": `${SITE_URL}/#website` },
    inLanguage: "en",
  };
}

export function faqJsonLd(entries: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

/** Serialise JSON-LD safely: `</script>` inside content must not close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
