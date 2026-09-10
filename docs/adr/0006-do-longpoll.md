# 0006 — Durable Object long-poll instead of client polling

**Status:** Accepted

## Context
The legacy SPA polled every ~3 seconds per open thread, which scales poorly and adds latency.
Real coordination (a new counselor reply appearing on a seeker's open thread) is genuinely
stateful, which is what Durable Objects are for.

## Decision
Give each thread a `ThreadRoom` Durable Object (`idFromName("thread:<id>")`) that holds only a
message watermark. `waitForActivity` long-polls against it; on wake the Worker reads new
messages from D1 and returns them. Clients fall back to timed polling if the transport cannot
hold a request open.

## Consequences
- Near-instant updates without per-thread polling load.
- The DO stays tiny (one number), so it is cheap and cannot leak message content.
- The DO is exercised by `test/realtime.test.ts`, which requires `isolatedStorage:false`.
