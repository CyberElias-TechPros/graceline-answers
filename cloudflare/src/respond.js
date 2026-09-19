/** JSON response helpers shared by all API handlers. */

export function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function error(message, status = 400) {
  return json({ error: message }, { status });
}

/** Read + parse a JSON body, capping size like the cPanel backend (200kb). */
export async function readJson(request, limit = 200 * 1024) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > limit) return null;
  try {
    const text = await request.text();
    if (text.length > limit) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isMethod(request, method) {
  return request.method.toUpperCase() === method;
}
