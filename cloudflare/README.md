# GraceLine Answers — Cloudflare deployment

The full GraceLine Answers product (API + React SPA) deployed on **Cloudflare Workers**
with **D1** (SQLite), **KV** (rate limiting), the **Email Service** binding (notifications),
and **static assets** (the built SPA, served with per-route SEO meta injection).

```
cloudflare/
  wrangler.jsonc          Worker + D1 + KV + Email + assets config
  migrations/             D1 migrations (schema shared with the cPanel build)
  src/
    index.js              Worker entry: router, security headers, error handling
    config.js  util.js    site metadata + Worker-safe helpers
    db.js                 D1 helpers + first-boot bootstrap admin seed
    auth.js               WebCrypto JWT (HS256) + PBKDF2 password hashing + cookies
    rate-limit.js         KV fixed-window rate limiting
    crisis.js             crisis keyword detection (+ hotline banner)
    mail.js               Email Service binding (graceful no-op when disabled)
    seo.js                per-route meta/JSON-LD injection, robots/sitemap/RSS
    respond.js            JSON response helpers
    handlers/             questions, messages, archive, admin, prayer, stats
  test/e2e.mjs            73-assertion end-to-end suite against `wrangler dev`
  .dev.vars.example       local secrets template (copied to .dev.vars)
```

## API surface

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | liveness + D1/KV status |
| `POST /api/questions` | anonymous (or email) question submission; crisis detection |
| `GET /api/questions/by-token/:token` | seeker thread (question + messages with counselor names) |
| `POST /api/messages/seeker` | seeker follow-up (auth = tracking token) |
| `POST /api/messages/counselor` | counselor reply (auth = JWT cookie) |
| `GET /api/messages/poll?token\|question_id&since=` | new messages since watermark |
| `GET /api/archive` · `/categories` · `/:id` | public sanitized archive + FTS search |
| `POST /api/admin/login` · `/logout` · `GET /me` | counselor auth (httpOnly cookie JWT) |
| `GET /api/admin/questions?status=` | inbox (new/active/resolved) with assignee names |
| `GET /api/admin/questions/:id` | full thread: raw content + messages + internal notes |
| `POST /api/admin/questions/:id/claim` · `/unclaim` | claim/release a question |
| `POST /api/admin/questions/:id/note` · `/status` · `/publish` | notes, status, sanitize+publish |
| `GET /api/admin/stats` | admin aggregates |
| `GET/POST /api/admin/team` · `POST /:id/password` · `DELETE /:id` | team management (admin) |
| `GET /api/prayer` · `POST /api/prayer` · `POST /:id/pray` | prayer wall |
| `GET /api/stats` | public aggregates for marketing pages |
| `GET /robots.txt` · `/sitemap.xml` · `/feed.xml` | SEO endpoints |

The same SPA is also deployable on cPanel/DirectAdmin via the Express backend in
[`../cpanel-app`](../cpanel-app) — both backends expose identical contracts.

## Local development (no Cloudflare account needed)

```bash
cd cloudflare
npm install
npm run client:build                          # builds ../cpanel-app/client to dist/
cp .dev.vars.example .dev.vars                # then edit: JWT_SECRET, bootstrap admin
npm run d1:migrate                            # applies migrations to the local D1
npm run dev                                   # http://127.0.0.1:8787 (0.0.0.0)
```

`wrangler dev` gives you real local D1 (SQLite), KV, Email capture (written as `.eml`
and logged), and the static assets — the E2E suite runs against it:

```bash
# in another terminal, with the dev server running on :8791
BASE_URL=http://127.0.0.1:8791 npm run test:e2e
```

### Reset local state

```bash
npm run test:clean        # wipes .wrangler/state and re-applies migrations
```

## Production deployment

See [DEPLOY.md](./DEPLOY.md) for the exact `wrangler` commands. In short:

1. `wrangler d1 create graceline-answers-db` → paste the `database_id` into `wrangler.jsonc`.
2. `wrangler kv namespace create graceline-ratelimit` → paste the `id`.
3. `wrangler secret put JWT_SECRET` (≥ 32 chars), `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, and `EMAIL_FROM` (a verified address on an Email-Sending-enabled domain).
4. Set `PUBLIC_BASE_URL` in `vars` to your domain.
5. `npm run client:build && npm run deploy`.

The first authenticated request seeds the bootstrap admin from the env vars when the
`users` table is empty — change that password (team page) or delete the account after
creating real counselors.
