/**
 * Shared product contract.
 *
 * This file is the single source of truth for values that BOTH the Cloudflare
 * Worker API and the Vercel frontend must agree on: the category taxonomy, the
 * question lifecycle states, copy that appears in structured data, and the
 * validation limits enforced on input.
 *
 * It is intentionally dependency-free and framework-free so both packages can
 * import it directly and contract drift is impossible by construction.
 */

export const SITE_NAME = "GraceLine Answers";

export const SITE_TAGLINE = "Anonymous Bible Q&A and faith-centered Christian counseling.";

export const DEFAULT_DESCRIPTION =
  "Ask Bible and life questions anonymously and receive scripture-based counsel from real " +
  "pastors. Browse a searchable archive of answered questions. A ministry, not a substitute " +
  "for licensed therapy or emergency care.";

export const THERAPY_DISCLAIMER =
  "GraceLine Answers is a ministry, not a substitute for licensed therapy or emergency care.";

export const CRISIS_DISCLAIMER =
  "If you are in immediate danger, contact local emergency services. If you are in crisis, " +
  "please reach out to a crisis hotline now.";

/**
 * The topic taxonomy. Surfaced as a filter on /ask and /archive, and each one
 * gets a landing page at /archive/category/:slug for topical coverage.
 */
export const CATEGORIES = [
  "Bible Interpretation",
  "Salvation",
  "Prayer",
  "Marriage",
  "Parenting",
  "Youth",
  "Anxiety",
  "Depression",
  "Faith Crisis",
  "Grief",
  "Career",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

export function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function categoryFromSlug(slug: string): Category | null {
  return CATEGORIES.find((c) => categorySlug(c) === slug) ?? null;
}

/** Question lifecycle. Enforced server-side and by a CHECK constraint in D1. */
export const QUESTION_STATUSES = ["new", "active", "resolved"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const ROLES = ["admin", "counselor"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Input limits. Enforced by the Worker's validation layer; mirrored by the
 * frontend so users get feedback before submitting.
 */
export const LIMITS = {
  questionTitle: { min: 3, max: 200 },
  questionBody: { min: 20, max: 8000 },
  message: { min: 2, max: 4000 },
  publicTitle: { min: 3, max: 300 },
  publicBody: { min: 10, max: 12000 },
  publicAnswer: { min: 20, max: 20000 },
  note: { min: 1, max: 8000 },
  prayerTitle: { min: 2, max: 200 },
  prayerBody: { min: 5, max: 4000 },
  password: { min: 12, max: 200 },
  name: { min: 1, max: 120 },
  email: { max: 255 },
} as const;

/**
 * A short excerpt used for cards, meta descriptions and RSS summaries.
 * Collapses whitespace and never cuts mid-word when it can help it.
 */
export function excerpt(text: string | null | undefined, max = 160): string {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const slice = flat.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).replace(/[,.;:]$/, "")}…`;
}

/** Deterministic, collision-resistant URL slug for published answers. */
export function slugify(input: string): string {
  return String(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
}

/** Crisis resources shown whenever crisis language is detected. */
export const CRISIS_BANNER = {
  title: "You are not alone — please reach out for help right now.",
  lead: "If you are in immediate danger, contact your local emergency services first.",
  lines: [
    { label: "US & Canada — 988 Suicide & Crisis Lifeline", value: "Call or text 988" },
    { label: "UK & Ireland — Samaritans", value: "Call 116 123" },
    { label: "Australia — Lifeline", value: "Call 13 11 14" },
    { label: "Anywhere else", value: "findahelpline.com" },
  ],
} as const;

/** Words that flag a submission as needing urgent, human attention. */
export const CRISIS_KEYWORDS = [
  "suicide",
  "suicidal",
  "kill myself",
  "killing myself",
  "end my life",
  "end it all",
  "want to die",
  "better off dead",
  "self-harm",
  "self harm",
  "selfharm",
  "cutting myself",
  "hurt myself",
  "harming myself",
  "overdose",
  "die tonight",
  "abuse",
  "abused",
  "abusive",
  "rape",
  "raped",
  "molested",
  "domestic violence",
  "trafficking",
] as const;

/** Detect crisis language in free text. Word-boundary aware to cut false positives. */
export function detectCrisis(text: string): { isCrisis: boolean; hits: string[] } {
  const haystack = String(text ?? "").toLowerCase();
  const hits = CRISIS_KEYWORDS.filter((keyword) => {
    const pattern = keyword.includes(" ")
      ? keyword
      : `\\b${keyword.replace(/[-]/g, "[\\s-]?")}\\b`;
    return new RegExp(pattern).test(haystack);
  });
  return { isCrisis: hits.length > 0, hits };
}
