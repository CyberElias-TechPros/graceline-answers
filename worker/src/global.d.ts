/**
 * `Headers#getSetCookie()` exists in the Workers runtime (and in every modern
 * browser) but is not in the pinned @cloudflare/workers-types revision.
 *
 * It matters here for correctness, not convenience: the API sets two cookies on
 * login, and reading them back through the normal iterator would collapse them
 * into a single unusable value. Declaring it keeps the call sites honest rather
 * than scattered with casts.
 */
interface Headers {
  getSetCookie(): string[];
}
