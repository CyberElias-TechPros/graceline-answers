/**
 * Single source of truth for "where is the Worker?".
 *
 * Both the server entry (which proxies browser requests) and the SSR loaders
 * (which fetch during render) need this value. It used to be duplicated, and the
 * two copies disagreed: the proxy defaulted to the local Worker while the
 * loaders defaulted to an empty string, which made every SSR `fetch` throw
 * `Invalid URL`. Because loaders catch their own errors, the site quietly
 * rendered as an empty archive instead of failing loudly.
 *
 * Keeping it in one module means the two paths cannot drift again.
 */

/** Local `wrangler dev` default, used when nothing is configured. */
const LOCAL_ORIGIN = "http://127.0.0.1:8787";

export function resolveApiOrigin(): string {
  // Read defensively so this module stays safe to bundle for the browser, where
  // `process` does not exist. In the browser we return "" and call same-origin.
  if (typeof window !== "undefined") return "";
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const configured = env?.API_ORIGIN ?? env?.WORKER_API_ORIGIN ?? "";
  return (configured || LOCAL_ORIGIN).replace(/\/+$/, "");
}

/** True when the resolved origin is the local dev default rather than a real one. */
export function isDefaultApiOrigin(): boolean {
  return resolveApiOrigin() === LOCAL_ORIGIN;
}
