# GraceLine Answers

Anonymous Bible Q&A and faith-centered Christian counseling — a single Node.js app that
runs on cPanel / DirectAdmin shared hosting (Phusion Passenger).

> The same product is also deployed on **Cloudflare Workers** (D1 + KV + Email Service)
> from [`../cloudflare/`](../cloudflare) — the recommended deployment. Both backends
> expose the same API and serve the same React SPA in `client/`.

> **What it is:** people can ask Bible and life questions completely anonymously. A real
> counselor responds privately via a unique tracking link. When a Q&A can help others, the
> counselor writes a sanitized public copy and publishes it to a searchable archive. There
> is also a community prayer wall.

## Stack

- **Runtime:** Node.js 20/22 (18+ works with native `better-sqlite3`)
- **Backend:** Express
- **Frontend:** React + Vite SPA (built to static files, served by Express)
- **Database:** SQLite (`better-sqlite3`, with automatic fallback to Node's `node:sqlite`)
- **Auth:** JWT in httpOnly cookies, bcrypt password hashing
- **Search:** SQLite FTS5
- **Email:** Nodemailer (your cPanel SMTP account)
- **Real-time chat:** HTTP long-polling every 3s

Everything lives in **one process** (no Redis, no S3, no managed DB, no external task
queues). This is intentional so it deploys anywhere with a Node.js app runner.

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Configure env (copy the example and fill in real values)
cp .env.example .env
#   For local dev you can leave SMTP empty; emails are skipped with a log message.

# 3. Build the frontend
npm run build

# 4. Start the server (API + SPA on :3000 by default)
npm start
```

Frontend hot-reload during development:

```bash
# Terminal A - API server
npm run dev:server

# Terminal B - Vite dev server (proxies /api to :3000)
npm run dev:client
```

For local development set `NODE_ENV=development` and provide a `JWT_SECRET` (or the app
falls back to a volatile dev secret and prints a warning).

## Tests

```bash
npm test
```

Runs the integration test suite (`node --test`) against an in-memory SQLite database. It
covers health, auth, submission, messaging, publishing, archive search, prayer, robots,
sitemap, and SPA meta injection.

## Product features

- **Anonymous ask** — IP/UA/fingerprint are never stored for anonymous submissions.
- **Private threaded conversation** — a shareable tracking link, polled for new messages;
  counselor replies carry the counselor's name.
- **Claim/assign workflow** — counselors claim questions; assignees show in the inbox.
- **Counselor console** — inbox (new/active/resolved), reply, internal notes, status,
  publish to archive.
- **Team management** (admin only) — add/remove counselors, reset passwords, assign roles.
- **Public searchable archive** — SQLite FTS5; only sanitized public content is indexed.
- **Prayer wall** — anonymous requests with an "I prayed" counter.
- **Crisis detection** — keyword detection surfaces a hotline banner on the Ask and Thread
  pages.
- **Email notifications** — counselor gets a new-question email; the seeker (if they gave
  an email) gets a reply email.
- **SEO** — robots.txt, XML sitemap, RSS feed, and server-injected per-page metadata +
  JSON-LD for public pages.

## Privacy & safety

- Anonymous submissions store only what the seeker types — no IP, no user-agent, no
  fingerprint.
- A question is never auto-public. Only a counselor's hand-edited, anonymized copy is
  published.
- Rate limits protect login, submission, messaging, and prayer endpoints.
- Security headers (Content-Security-Policy in production, nosniff, X-Frame-Options,
  Referrer-Policy) are set on every response.
- Site disclaimers make clear this is a ministry, not a substitute for licensed therapy or
  emergency care.

## Configuration

See `.env.example`. Key variables:

| Var | Purpose |
| --- | --- |
| `JWT_SECRET` | ≥32-char signing key; required in production |
| `ADMIN_BOOTSTRAP_EMAIL` / `_PASSWORD` | Seeded admin on first boot |
| `PUBLIC_BASE_URL` | Absolute site URL (emails, sitemap, canonical) |
| `DB_PATH` | Optional SQLite path (default `data/app.sqlite`) |
| `SMTP_*` | cPanel SMTP credentials for email |

## Project layout

```
app.js                 Passenger entry (boots the server)
server/
  index.js             Boot + listen
  app.js               Express app factory (routes, headers, SPA + SEO)
  db.js                Open DB, schema, bootstrap seed
  sqlite.js            better-sqlite3 -> node:sqlite adapter
  auth.js              JWT + bcrypt helpers, role middleware
  util.js              randomToken, clampString
  config.js            Site-level constants
  seo-render.js        Server-side meta/JSON-LD injection
  crisis.js            Crisis keyword detection
  mailer.js            Nodemailer (graceful skip if unconfigured)
  routes/
    questions.js  messages.js  archive.js  admin.js  prayer.js  seo.js
client/
  src/                 React app (Vite)
test/
  app.test.js          Integration tests
```

See [`DEPLOY.md`](./DEPLOY.md) for cPanel/DirectAdmin deployment steps.
