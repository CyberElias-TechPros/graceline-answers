# GraceLine Answers

**Anonymous Bible Q&A and faith-centered Christian counseling** — a production-ready web
application with two fully wired, end-to-end tested backends:

| Deployment | Stack | Where |
| --- | --- | --- |
| **Cloudflare Workers** (primary) | Worker + **D1** (SQLite/FTS5) + **KV** (rate limiting) + **Email Service** + static assets | [`cloudflare/`](./cloudflare) |
| cPanel / DirectAdmin | Express + React/Vite + SQLite, one Node.js process (Phusion Passenger) | [`cpanel-app/`](./cpanel-app) |

Both backends expose the **same API contract** and serve the **same React SPA**
(`cpanel-app/client/`), so the frontend is deployment-agnostic.

People can ask Bible and life questions **completely anonymously**, receive a private,
scripture-based reply from a real counselor, and browse a searchable archive of
anonymized answers. There is also a community prayer wall.

## Product capabilities

- **Anonymous ask** — IP/UA/fingerprint are never stored (no column exists for them).
- **Private threaded conversation** — shareable tracking link, 3s polling, counselor
  replies show the counselor's name.
- **Claim/assign workflow** — counselors claim questions from the inbox; the assignee is
  visible in the console; admins can reassign or release.
- **Counselor console** — inbox (new/active/resolved), raw thread + internal notes,
  status changes, sanitize-and-publish (a question is *never* auto-public).
- **Team management** (admin) — add/remove counselors, reset passwords, assign roles.
- **Crisis detection** — keyword hits flag urgency, notify the counselor pool by email,
  and surface a hotline banner (US/UK/NG/international) to the seeker.
- **Public archive** — FTS5 search + category filter + pagination; only hand-sanitized
  content is indexed; QAPage/BreadcrumbList JSON-LD on item pages.
- **Prayer wall** — anonymous requests with an "I prayed" counter.
- **Email notifications** — new-question alerts (counselor pool) and reply notices
  (seeker, when an email was given) via Cloudflare Email Service / cPanel SMTP.
- **SEO** — robots.txt, XML sitemap, RSS, per-route meta + JSON-LD injected by the
  server, admin/private routes noindexed.
- **Security** — JWT in httpOnly cookies (WebCrypto HS256 / jsonwebtoken), PBKDF2
  (Workers) / bcrypt (cPanel), rate limiting on every public endpoint, strict CSP +
  security headers, IDOR-safe authorization, server-side validation.

## Quick start — Cloudflare (recommended)

```bash
cd cloudflare
npm install
npm run client:build          # builds the shared SPA
cp .dev.vars.example .dev.vars # set JWT_SECRET + bootstrap admin
npm run d1:migrate
npm run dev                   # → http://127.0.0.1:8787
```

No Cloudflare account needed for local development — `wrangler dev` runs real local D1,
KV, and email capture. Run the 73-assertion E2E suite against it:

```bash
BASE_URL=http://127.0.0.1:8791 npm run test:e2e   # (start dev server on 8791)
```

Production deployment steps: [cloudflare/DEPLOY.md](./cloudflare/DEPLOY.md).

## Quick start — cPanel / DirectAdmin

```bash
cd cpanel-app
npm install
cp .env.example .env          # set JWT_SECRET + SMTP + bootstrap admin
npm run build
npm start                     # → http://localhost:3000
npm test                      # 27 integration tests (in-memory SQLite)
```

Deployment steps: [cpanel-app/DEPLOY.md](./cpanel-app/DEPLOY.md).

## The experience

The frontend is a cinematic, motion-driven React SPA: night-ink + candlelight palette,
Fraunces display serif + Manrope UI sans (self-hosted), film grain, floating dust
particles, Ken Burns imagery, scroll-reveal choreography, count-up stats, and a
counselor console tuned for pastoral care — with full `prefers-reduced-motion` support.

## Repository layout

```text
cloudflare/          Cloudflare Workers deployment (Worker + D1 + KV + Email + assets)
  wrangler.jsonc     bindings & assets config
  migrations/        D1 schema (shared with cPanel)
  src/               worker source (handlers, auth, rate limit, SEO)
  test/e2e.mjs       end-to-end suite (73 assertions)
cpanel-app/          cPanel/DirectAdmin deployment (Express + SQLite)
  app.js             Passenger entry
  server/            Express API + SEO rendering
  client/            THE shared React SPA (Vite) — used by both deployments
  test/              integration tests (27)
.lovable/plan.md     original deployment plan (historical)
src/                 (Lovable scaffold informational page — not a deploy target)
```

## Test status

- `cloudflare`: **73/73 E2E assertions pass** against `wrangler dev` (real local D1/KV/Email).
- `cpanel-app`: **27/27 integration tests pass** against in-memory SQLite.
