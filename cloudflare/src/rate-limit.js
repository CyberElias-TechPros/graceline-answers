/**
 * KV-backed rate limiting for the Cloudflare Worker.
 *
 * Fixed-window counters, equivalent in spirit to the express-rate-limit rules
 * used by the cPanel backend:
 *
 *   key           window  max   protects
 *   submit        1 h     10    POST /api/questions
 *   seeker-msg    1 min   12    POST /api/messages/seeker
 *   counselor-msg 1 min   30    POST /api/messages/counselor
 *   login         15 min  10    POST /api/admin/login
 *   pray          1 min   20    POST /api/prayer/:id/pray
 *   pray-post     1 h     5     POST /api/prayer
 */
const WINDOWS = {
  'submit:1h': 3600,
  'seeker-msg:1m': 60,
  'counselor-msg:1m': 60,
  'login:15m': 900,
  'pray:1m': 60,
  'pray-post:1h': 3600,
};

export function rateLimitKey(name, window) {
  return `${name}:${window}`;
}

/**
 * @param {object} env Worker env (needs KV)
 * @param {string} windowName e.g. rateLimitKey('submit', '1h')
 * @param {string} identity client-scoped key (IP) or resource-scoped (token)
 * @param {number} max requests per window
 * @returns {Promise<{limited: boolean, retryAfterSec: number|null, max: number}>}
 */
export async function rateLimit(env, windowName, identity, max) {
  const ttl = WINDOWS[windowName];
  if (!ttl) return { limited: false, retryAfterSec: null, max };
  if (env.RATE_LIMIT_BYPASS === '1') return { limited: false, retryAfterSec: null, max };

  const now = Date.now();
  const bucket = Math.floor(now / (ttl * 1000));
  const key = `rl:${windowName}:${identity}:${bucket}`;

  let current = 0;
  try {
    current = Number((await env.KV.get(key, 'text')) || 0) || 0;
  } catch {
    current = 0;
  }
  if (current + 1 > max) {
    const retryAfterSec = Math.ceil((ttl - (now - bucket * ttl * 1000)) / 1000);
    return { limited: true, retryAfterSec, max };
  }
  try {
    await env.KV.put(key, String(current + 1), { expirationTtl: ttl });
  } catch {
    /* KV failure must not break the happy path — fail open */
  }
  return { limited: false, retryAfterSec: null, max };
}
