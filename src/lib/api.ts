/**
 * API client.
 *
 * Two environments, one contract:
 *
 *   • In the browser we call the same origin (`/api/...`). Vercel rewrites that
 *     to the Cloudflare Worker, so cookies stay first-party and no CORS
 *     configuration is needed anywhere.
 *   • During SSR there is no browser origin, so the loader talks to the Worker
 *     directly using API_ORIGIN.
 *
 * Response shapes mirror the Worker exactly. They are redeclared here rather
 * than imported from the worker package because the two deploy independently;
 * `worker/test` pins the server side, and these types pin the client side.
 */

export type PublicArchiveEntry = {
  id: number;
  slug: string;
  title: string;
  content: string;
  answer: string;
  category: string | null;
  publishedAt: number;
  excerpt: string;
};

export type ArchivePage = {
  items: PublicArchiveEntry[];
  hasMore: boolean;
  nextCursor: number | null;
  total: number;
  query: string | null;
  category: string | null;
};

export type CategoryEntry = { name: string; slug: string; count?: number };

export type ThreadMessage = {
  id: number;
  sender: "seeker" | "counselor";
  content: string;
  createdAt: number;
};

export type SeekerThread = {
  question: {
    id: number;
    title: string;
    content: string;
    category: string | null;
    status: "new" | "active" | "resolved";
    isUrgent: boolean;
    createdAt: number;
    lastMessageAt: number | null;
    hasReplies: boolean;
  };
  messages: ThreadMessage[];
  lastMessageId: number;
  crisis: CrisisResult;
  disclaimer: string;
  now: number;
};

export type CrisisResult = {
  isCrisis: boolean;
  hits: string[];
  banner?: {
    title: string;
    lead: string;
    lines: { label: string; value: string }[];
  };
};

export type PrayerEntry = {
  id: number;
  title: string;
  content: string;
  prayedCount: number;
  createdAt: number;
};

export type SiteStats = { publishedAnswers: number; prayersOffered: number };

export type InboxItem = {
  id: number;
  title: string;
  category: string | null;
  status: "new" | "active" | "resolved";
  isUrgent: boolean;
  hasSeekerEmail: boolean;
  messageCount: number;
  unreadSince: number | null;
  assignedTo: string | null;
  assigneeName: string | null;
  createdAt: number;
  updatedAt: number;
};

export type CounselorUser = { id: string; email: string; name: string | null; role: "admin" | "counselor" };

export type ApiError = { error: string; message: string; details?: Record<string, string[]> };

/** Thrown for any non-2xx response, carrying the server's own message. */
export class RequestError extends Error {
  status: number;
  code: string;
  details?: Record<string, string[]>;

  constructor(status: number, body: ApiError) {
    super(body.message || `Request failed (${status})`);
    this.name = "RequestError";
    this.status = status;
    this.code = body.error || "server_error";
    this.details = body.details;
  }
}

import { resolveApiOrigin } from "./api-origin";

/**
 * Empty string in the browser (so requests are same-origin through the proxy),
 * the Worker's absolute origin during SSR. See ./api-origin for why this is
 * shared with the server entry rather than resolved in both places.
 */
function apiOrigin(): string {
  return resolveApiOrigin();
}

/**
 * Read the double-submit CSRF token.
 *
 * The Worker sets `gl_csrf` as a non-HttpOnly cookie precisely so page
 * JavaScript can echo it back in a header. An attacker on another origin can
 * make the browser send the cookie but cannot read it, which is what makes the
 * pair a meaningful check rather than decoration.
 */
export function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)gl_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Session cookie, forwarded during SSR for admin loaders. */
  cookie?: string | null;
  csrf?: string | null;
  signal?: AbortSignal;
  /** Cache mode for SSR fetches. */
  cache?: RequestCache;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.cookie) headers.cookie = options.cookie;
  const csrf = options.csrf ?? (typeof window !== "undefined" ? csrfToken() : null);
  if (csrf) headers["x-csrf-token"] = csrf;

  const response = await fetch(`${apiOrigin()}/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: typeof window === "undefined" ? "omit" : "include",
    signal: options.signal,
    ...(options.cache ? { cache: options.cache } : {}),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    throw new RequestError(response.status, (parsed as ApiError) ?? { error: "server_error", message: "" });
  }
  return parsed as T;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "counselor";
  lastLoginAt: number | null;
};

/**
 * `apiFetch` for SSR loaders that can render without data.
 *
 * Loaders must be allowed to fail — a cold Worker should not take the homepage
 * down. But a silent `catch` made an unreachable API indistinguishable from an
 * empty archive, and the site looked "working" while showing nothing. This
 * returns null *and* logs, so the degradation is visible in the server log.
 */
export async function apiFetchOrNull<T>(path: string, options: RequestOptions = {}): Promise<T | null> {
  try {
    return await apiFetch<T>(path, options);
  } catch (error) {
    const detail = error instanceof RequestError ? `${error.status} ${error.code}` : String(error);
    console.error(`[graceline] SSR data unavailable for ${path}: ${detail}`);
    return null;
  }
}

export const SITE_URL = (() => {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (typeof window !== "undefined") return window.location.origin;
  return (meta?.VITE_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
})();
