/**
 * ThreadRoom — a Durable Object that makes conversation delivery near-instant.
 *
 * The legacy app polled `/api/messages/poll` every 3 seconds from every open
 * thread. That is 20 requests per minute per open tab, almost all of them
 * returning nothing, and replies still take up to 3 seconds to appear.
 *
 * This object holds one small piece of durable state per conversation — the
 * highest message id written so far — and lets clients *wait* on it instead of
 * asking repeatedly:
 *
 *   GET  /wait?since=N   returns as soon as a message with id > N exists,
 *                        or after `timeout` ms with the unchanged watermark.
 *   POST /notify         called by the Worker after a message is written;
 *                        bumps the watermark and releases waiting clients.
 *
 * It deliberately stores no message content. The Worker still reads the actual
 * messages from D1, so the object cannot become a second source of truth or a
 * place where private text accumulates.
 */
export class ThreadRoom {
  private readonly state: DurableObjectState;
  private waiters: Array<{ since: number; resolve: (watermark: number) => void }> = [];

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
  }

  private async watermark(): Promise<number> {
    return Number((await this.state.storage.get<number>("watermark")) ?? 0);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/notify") {
      return this.handleNotify(request);
    }
    if (request.method === "GET" && url.pathname === "/wait") {
      return this.handleWait(url);
    }
    if (request.method === "GET" && url.pathname === "/state") {
      return Response.json({ watermark: await this.watermark() });
    }
    return new Response("Not found", { status: 404 });
  }

  private async handleNotify(request: Request): Promise<Response> {
    let messageId = 0;
    try {
      const body = (await request.json()) as { messageId?: unknown };
      messageId = Number(body.messageId ?? 0);
    } catch {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    if (!Number.isSafeInteger(messageId) || messageId < 0) {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }

    const current = await this.watermark();
    const next = Math.max(current, messageId);
    if (next !== current) await this.state.storage.put("watermark", next);

    // Release every client whose watermark is now behind. Waiters that asked for
    // a later id stay parked.
    const releasable = this.waiters.filter((waiter) => waiter.since < next);
    this.waiters = this.waiters.filter((waiter) => waiter.since >= next);
    for (const waiter of releasable) waiter.resolve(next);

    return Response.json({ ok: true, watermark: next });
  }

  private async handleWait(url: URL): Promise<Response> {
    const since = Number(url.searchParams.get("since") ?? 0);
    if (!Number.isFinite(since) || since < 0) {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }

    const current = await this.watermark();
    if (current > since) {
      return Response.json({ watermark: current, waited: false });
    }

    // Hold the request open. Clients cap their own timeout; we also cap here so
    // a forgotten client cannot park a connection indefinitely.
    const requested = Number(url.searchParams.get("timeout") ?? 25_000);
    const timeoutMs = Math.min(Math.max(Number.isFinite(requested) ? requested : 25_000, 1_000), 55_000);

    const watermark = await new Promise<number>((resolve) => {
      const entry = { since, resolve: (_value: number) => {} };
      entry.resolve = (value: number) => {
        clearTimeout(timer);
        this.waiters = this.waiters.filter((w) => w !== entry);
        resolve(value);
      };
      const timer = setTimeout(() => entry.resolve(current), timeoutMs);
      this.waiters.push(entry);
    });

    return Response.json({ watermark, waited: true });
  }
}
