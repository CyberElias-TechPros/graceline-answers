# Architecture

GraceLine Answers is an anonymous Bible Q&A and faith-counseling ministry. Seekers submit
questions anonymously, a counselor replies on a private thread, and the counselor may later
publish a rewritten, anonymised copy to a public, searchable archive. There is also a
community prayer wall.

The system is split into two independently deployed units that talk to each other over a
same-origin proxy:

```
┌──────────────────────────┐        ┌──────────────────────────────────────────┐
│  Frontend (Vercel)       │        │  API (Cloudflare Workers)                │
│  TanStack Start / React  │  /api  │  Hono + D1 + KV + Durable Objects        │
│  SSR public pages        │───────▶│  + Queues (email) + Cron                 │
│  proxies /api/* ─────────┘        │                                          │
└──────────────────────────┘        └──────────────────────────────────────────┘
```

The browser never calls the Worker directly. The Vercel server entry (`src/server.ts`)
rewrites `/api/*` (and `/robots.txt`, `/sitemap.xml`, `/feed.xml`) to the Worker using the
`API_ORIGIN` environment variable. This keeps every request same-origin from the browser's
point of view, which is what makes first-party cookies and the CSRF double-submit check work
without any CORS configuration.

## Frontend — repo root, deployed to Vercel

- Framework: TanStack Start (React 19, Vite 8, Nitro `vercel` preset — see `vite.config.ts`).
- Public pages (home, ask, archive, category, answer detail, prayer, about, privacy) are
  **server-rendered** so crawlers receive full content, per-page metadata, canonicals and
  JSON-LD in the first HTML response. Loaders degrade gracefully if the API is cold.
- Interactive surfaces (private thread, counselor console) fetch client-side with React Query.
- The console (`/admin/*`) is inverted to a dark theme on purpose and is excluded from the
  index (`noindex` + `robots.txt Disallow`).
- `src/server.ts` is the Nitro entry: it proxies `/api/*`, normalises catastrophic SSR 500s,
  and returns a JSON 502 when the Worker is unreachable so an API outage is distinguishable
  from a rendering failure.

## API — `worker/`, deployed to Cloudflare Workers

A single Worker (`worker/src/index.ts`) exports `fetch`, `queue` and `scheduled`, plus the
`ThreadRoom` Durable Object. Bindings (see `worker/wrangler.jsonc`):

| Binding      | Service            | Why it is used                                        |
| ------------ | ------------------ | ----------------------------------------------------- |
| `DB`         | D1                 | Relational store (users, questions, messages, notes, prayers, audit, FTS5) |
| `CACHE`      | KV                 | Fixed-window rate limiting with self-expiring keys    |
| `THREAD_ROOM`| Durable Object     | Per-thread long-poll watermark (replaces 3s polling)  |
| `EMAIL_QUEUE`| Queues             | Async email with retries and a dead-letter queue      |
| crons        | Cron triggers      | Hourly unanswered-escalation digest; daily audit prune + FTS integrity |

R2 is deliberately **not** used: there is no object-storage requirement.

### Data model highlights

- `questions` is the aggregate root. Raw (private) text and the counselor's rewritten public
  fields live on the same row; a row is indexable only when `is_public = 1` **and** all three
  public fields are non-null.
- `public_slug` is `{slugified-title}-{base36(id)}`. Numeric legacy ids 301-redirect to the
  slug so an answer is never indexed twice.
- `archive_fts` is a contentless FTS5 index maintained by `is_public`-guarded triggers. Public
  reads always join back to `questions` with `is_public = 1`, so a stray index row can never
  leak a private question.
- **No IP address, user-agent, device or fingerprint column exists anywhere.** Privacy is a
  schema property, not a policy promise.

### Security

- Sessions: `gl_session` (HttpOnly, `SameSite=Lax`, `Path=/api`, 30d) holds an HS256 JWT via
  `jose`; `gl_csrf` (JS-readable) feeds the double-submit header. Mutating admin routes require
  the CSRF header.
- Passwords: PBKDF2-SHA256 (WebCrypto), 210k iterations, 16-byte salt, 32-byte key, with
  `needsRehash()`. bcrypt is not used because the Worker's CPU budget cannot afford it.
- First admin is bootstrapped from `ADMIN_BOOTSTRAP_EMAIL/PASSWORD` **only while the users
  table is empty**; it cannot fire twice.
- Login is enumeration-resistant (identical 401 for unknown email / wrong password) and
  rate-limited with lockout.
- All privileged actions are written to `audit_log` (no addresses stored).

### Realtime

A seeker or counselor opens a long-poll against the thread's `ThreadRoom` Durable Object, which
holds only a watermark; the Worker reads new messages from D1. If the environment cannot hold a
request open (e.g. a 10s serverless cap on the Vercel proxy), clients fall back to timed polling.

## Shared code

`shared/site.ts` is the single source of truth for the category list, field limits, crisis
keywords, crisis banner copy, and the slug/excerpt helpers. Both the Worker and the frontend
import it, so the two deploy units cannot disagree about taxonomy or limits.
