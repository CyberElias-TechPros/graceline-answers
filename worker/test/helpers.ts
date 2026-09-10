import { SELF } from "cloudflare:test";

/**
 * Minimal HTTP client for tests.
 *
 * Every request carries a distinct `cf-connecting-ip` so the KV-backed rate
 * limiter sees a fresh identity per test — otherwise the whole suite would
 * share one bucket and start tripping limits that are working correctly.
 */

export type CookieJar = Map<string, string>;

export function newJar(): CookieJar {
  return new Map();
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function absorbCookies(jar: CookieJar, response: Response): void {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const entry of raw) {
    const [pair] = entry.split(";");
    if (!pair) continue;
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    // An expired Max-Age means the server is clearing the cookie.
    if (/Max-Age=0\b/i.test(entry)) jar.delete(name);
    else jar.set(name, value);
  }
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  jar?: CookieJar;
  ip?: string;
  headers?: Record<string, string>;
  csrf?: string;
  origin?: string;
};

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<{
  status: number;
  body: T | null;
  text: string;
  response: Response;
}> {
  const headers: Record<string, string> = {
    "cf-connecting-ip": options.ip ?? "203.0.113.10",
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.jar && options.jar.size > 0) headers.cookie = cookieHeader(options.jar);
  if (options.csrf) headers["x-csrf-token"] = options.csrf;
  if (options.origin) headers.origin = options.origin;

  const response = await SELF.fetch(`https://api.graceline.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (options.jar) absorbCookies(options.jar, response);

  const text = await response.text();
  let body: T | null = null;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = null;
  }
  return { status: response.status, body, text, response };
}

/** Sign in as the bootstrap administrator and return the session cookie jar. */
export async function loginAdmin(
  // KV persists across tests in a file (isolated storage is off for Durable
  // Object compatibility), so each login needs its own IP or the shared login
  // rate-limit bucket would start rejecting later tests.
  ip = uniqueIp(),
  email = "pastor@example.com",
  password = "a-very-strong-pass-123",
): Promise<{ jar: CookieJar; csrf: string; user: { id: string; email: string; role: string } }> {
  const jar = newJar();
  const result = await request<{ user: { id: string; email: string; role: string }; csrf: string }>(
    "/api/admin/login",
    { method: "POST", body: { email, password }, jar, ip },
  );
  if (result.status !== 200 || !result.body) {
    throw new Error(`login failed: ${result.status} ${result.text}`);
  }
  return { jar, csrf: result.body.csrf, user: result.body.user };
}

/** Submit a question and return its id + tracking token. */
export async function submitQuestion(overrides: Record<string, unknown> = {}, ip = uniqueIp()): Promise<{ id: number; token: string; crisis: { isCrisis: boolean } }> {
  const result = await request<{ id: number; trackingToken: string; crisis: { isCrisis: boolean } }>(
    "/api/questions",
    {
      method: "POST",
      ip,
      body: {
        title: "What does it mean to be born again?",
        content:
          "I have read John 3 several times and I still do not understand what Jesus means. Can someone explain it plainly?",
        category: "Bible Interpretation",
        ...overrides,
      },
    },
  );
  if (result.status !== 201 || !result.body) {
    throw new Error(`submit failed: ${result.status} ${result.text}`);
  }
  return { id: result.body.id, token: result.body.trackingToken, crisis: result.body.crisis };
}

/**
 * A fresh rate-limit identity per call.
 *
 * Counter-based rather than random: with ~90 tests issuing several requests each,
 * random values in a /24 collide often enough to make rate-limit assertions
 * flaky, and a collision means two tests share a bucket.
 */
let ipCounter = 0;
export function uniqueIp(): string {
  ipCounter += 1;
  const second = 0 + Math.floor(ipCounter / 250);
  const third = ipCounter % 250;
  return `192.${second}.${third}.7`;
}
