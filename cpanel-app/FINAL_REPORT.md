# GraceLine Answers — Engineering & Production Report

## A. Product Reconstruction

**What it is:** GraceLine Answers is an anonymous Bible Q&A and faith-centered Christian
counseling platform. People submit questions (fully anonymous or with an email), receive a
private, scripture-based reply from a real counselor, and browse a searchable public archive
of anonymized answers. There is also a community prayer wall.

**Who it serves:** seekers in any season of life (anxiety, faith crisis, marriage, parenting,
Bible interpretation, etc.) and counselors/pastors who answer them.

**Problem solved:** removes the fear and barrier of asking hard questions by guaranteeing
anonymity and humane, scripture-grounded responses from real people (not bots), plus a public
repository of answers that can help many.

**Category:** faith & counseling community / ministry web application (primary), with
social-community characteristics (prayer wall) and knowledge-sharing (public archive).

**Maturity (initial → now):** MVP with visible-but-thin polish → **Production Candidate.** Core
workflows, security, SEO, design, and tests are in place and verified.

## B. Initial State

The repository was a **context-rich** project (`.lovable/plan.md`, `DEPLOY.md`, root
informational page) but the code was an **incomplete, partially-broken MVP**:

- A `nanoid@5` **ESM-only** dependency used via CommonJS `require()` — crashes on cPanel
  Node 18/20.
- `multer` (deprecated, multiple CVEs) was a **dependency but never used**.
- `better-sqlite3` native build is fragile; no runtime fallback; un-runnable in this sandbox.
- **No login rate limiting** → brute-force exposure.
- Archive FTS search **threw a 500** on punctuation (`+`, `-`, `~`, `^`, `:`).
- **No tests** at all.
- **No SEO**: no robots.txt, sitemap, RSS, meta injection, or structured data; admin pages
  were indexable.
- **No team management** — a counseling ministry could never add counselors.
- **No pagination**, no categories endpoint, fragile ID handling.
- **Generic, un-branded UI** (simple table-stakes styling, no hero, no identity).

## C. Major Problems Found (by severity)

**Critical**
- ESM-only `nanoid` breaks the server on production Node (18/20).
- No login brute-force protection.

**High**
- Search endpoint 500 on special-character queries (FTS5 injection/syntax).
- Weak/missing JWT secret silently accepted in production.
- No tests → regressions undetectable.
- Admin/private pages indexable; no SEO foundation.

**Medium**
- No team management; no way to add counselors.
- Fragile numeric ID handling (malformed IDs → 500).
- No pagination limits on archive / inbox; unbounded list growth.
- Unused, vulnerable `multer` dependency.

**Low**
- Duplicate/inconsistent email notification logic.
- Muted text contrast below AA.
- No client-side meta sync; placeholder canonical.

## D. Problems Fixed

| Problem | Evidence | Root Cause | Solution | Result |
| --- | --- | --- | --- | --- |
| Server crashes on cPanel | `nanoid@5` ESM + `require()` | ESM/CJS mismatch | Replaced with internal `crypto.randomBytes` token (`server/util.js`) | Works on all Node versions |
| Brute-force/login abuse | No limiter on `/admin/login` | Missing mitigation | Added `express-rate-limit` (10/15min) | Login throttled |
| FTS search 500 | `archive_fts MATCH 'x~2'` throws | Unvalidated user input passed to FTS | `buildFtsMatch` extracts alphanumeric words, quotes each, ANDs them | Never errors; predictable semantics |
| Weak JWT accepted | `|| 'dev-insecure-secret'` | Silent fallback | Fail-fast in production; volatile dev key | Production refuses weak secret |
| Broken on sandbox | `better-sqlite3` native build | Native module | `server/sqlite.js` adapter: try `better-sqlite3`, fall back to `node:sqlite` | Runs everywhere; production uses native |
| Malformed IDs → 500 | `Number('abc')` → NaN in SQL | No input guard | `parseId()` in util; applied to admin/messages/prayer | 400 instead of 500 |
| Inbox/archive unbounded | `LIMIT 200`/no pagination | Missing feature | Archive pagination (`hasMore`/`nextOffset`); harnessed limits | Predictable growth |
| No SEO | Missing files/routes | Not built | robots.txt, sitemap.xml, feed.xml, per-page meta/JSON-LD injection | Legitimate SEO foundation |
| Vulnerable unused dep | `multer@1` CVE | Leftover from plan | Removed from `package.json` | Cleaner, safer |

## E. Features Completed / Added

- **Counselor team management** (admin-only): add/remove counselors, reset passwords, assign
  roles, protect last admin & self-delete. New `/api/admin/team`, `/team/:id/password`,
  `/team/:id`, plus UI (`AdminTeam.jsx`).
- **Archive pagination + categories** endpoint; labeled `hasMore`/`nextOffset`.
- **RSS feed** (`/feed.xml`) as a legitimate content-distribution channel.
- **Per-page SEO meta + JSON-LD** injection server-side (Organization, QAPage, BreadcrumbList).
- **Admin console layout** with session check, stats, navigation.

## F. Inferred Features

Added based on repository evidence / user journeys / industry expectations / security:

- **Team management** — a counseling ministry requires multiple counselors; without it the
  product is unusable. (REQUIRED / STRONGLY-JUSTIFIED)
- **Rate limiting** on login, submit, message, prayer — security/reliability. (REQUIRED)
- **Login generic error** — prevents account enumeration. (REQUIRED, security)
- **SEO endpoints & meta injection** — public content must be discoverable. (STRONGLY-JUSTIFIED)
- **Archive pagination** — data grows; unbounded lists hurt UX/performance. (REQUIRED)

## G. Design Improvements

- **Bespoke design system** (`styles.css`): warm cream/sage/gold palette, paired serif display
  + sans UI typography, rounded cards with soft shadows, a coherent type scale.
- **Cinematic hero** using a bespoke generated dawn landscape (`hero-grace.jpg`) with a
  gradient overlay, large editorial headline, and clear CTAs.
- **Distinctive identity**: brand mark (compass glyph), gold accent lines, section eyebrow
  labels, storytelling "how it works" steps.
- **Purposeful motion**: subtle card lifts, button transitions, shimmer skeletons; fully
  disabled under `prefers-reduced-motion`.
- **Tactile interactions**: hover lifts, primary/secondary button hierarchy.
- **Responsive**: sticky header with mobile menu, responsive grids, mobile hero.
- **Accessibility**: skip-to-content link, visible focus rings, semantic landmark/labels,
  WCAG-friendly contrast, reduced-motion support.

## H. SEO Improvements

- robots.txt (allows public, disallows `/admin` & `/api/`).
- XML sitemap (home, archive, prayer, + every published Q&A).
- RSS feed.
- **Server-injected** per-page `<title>`, description, canonical, Open Graph, Twitter, and
  JSON-LD (Organization / QAPage / BreadcrumbList) for public pages — no JS required.
- `noindex, nofollow` on admin and private thread routes.
- Dynamic titles/descriptions client-side for navigation.
- Preserved immutable asset caching (hashed bundles) and no-cache HTML shell.

> No rankings are promised; this work systematically removes avoidable SEO weaknesses.

## I. Security

- JWT in httpOnly, `sameSite=lax` cookie; production requires a strong secret (fail-fast).
- bcrypt (cost 12) password hashing.
- Rate limiting on login, question submit, messaging, prayer.
- Security headers: CSP (production), `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Cross-Origin-Opener-Policy`.
- Server-side validation on all client input (lengths, email format, category/status
  whitelists); FTS query sanitization; `parseId` guards.
- IDOR-safe: counselor/team endpoints behind `requireAuth` + `requireRole`; archive only
  exposes public content; seeker identity held behind an unguessable tracking token.
- No secrets exposed client-side; only the public assets are served.
- Disabled `x-powered-by`; no stack traces leaked to clients.

## J. Performance

- Hashed static assets served with `Cache-Control: max-age=31536000, immutable`.
- HTML shell served with `no-cache` (so injected meta is fresh).
- 3s HTTP polling (no WebSocket dependency — safer on shared hosting).
- Efficient SQL: indexed queries, FTS5 for search, no N+1 in hot paths.
- Bundle is a single lean SPA (~222 kB JS / 67 kB gzip).

## K. Database

- SQLite via `better-sqlite3` (native on cPanel) with a transparent fallback to Node's
  built-in `node:sqlite` for hosts without a compiler.
- Schema: `users`, `questions`, `messages`, `internal_notes`, `prayer_requests`, plus a
  contentless FTS5 index (`archive_fts`).
- WAL mode, `foreign_keys = ON`, indexes on status/public/category/token/question_id.
- Configurable `DB_PATH`; safe `CREATE TABLE IF NOT EXISTS` migration (non-destructive).

## L. Architecture

Single Node.js process (per the documented cPanel/DirectAdmin constraint):

```
Express (API + SPA + SEO)
  ├── server/app.js        → app factory (routes, headers, SPA, SEO)
  ├── server/db.js         → schema + bootstrap seed
  ├── server/sqlite.js     → better-sqlite3 / node:sqlite adapter
  ├── server/auth.js       → JWT + bcrypt + roles
  ├── server/util.js       → randomToken, clampString, parseId
  ├── server/config.js     → site constants
  ├── server/crisis.js     → keyword detection
  ├── server/mailer.js     → nodemailer (graceful skip)
  ├── server/seo-render.js → SPA meta/JSON-LD injection
  └── server/routes/*      → questions, messages, archive, admin, prayer, seo
client/                    → React + Vite SPA
test/                      → node:test integration suite
```

The app is decoupled from deployment so it can also run as-is on any Node host.

## M. Vercel

Not used — **by design.** The repository's own engineering brief and deployment docs
(`.lovable/plan.md`, `DEPLOY.md`) explicitly mandate a single Node.js process on
cPanel/DirectAdmin shared hosting (Phusion Passenger) with no external services (no
Supabase/Vercel/Redis/S3/cloud functions). Honouring that documented requirement, the app
ships as a portable Node app rather than a Vercel/Cloudflare split.

## N. Cloudflare

Not used — same reason. The plan rules out edge functions, D1, R2, KV, Durable Objects,
Queues, and Cron. The SQLite file is the sole datastore; there are no background jobs that
require a queue; chat is polled; email uses the host's SMTP. Nothing here needs Cloudflare.

## O. Testing

- **23 integration tests** (`npm test`, `node --test`) against an in-memory SQLite DB:
  health, auth (login/logout/generic-errors/unauthorized), question submission (valid,
  too-short, crisis detection), thread fetch, seeker/counselor messaging, internal notes,
  publish validation, archive list + FTS search, prayer create/count, robots, sitemap, SPA
  meta injection (index vs noindex), team creation, malformed ID handling.
- All 23 pass.
- Frontend production build succeeds (`vite build`, no errors).
- Manual end-to-end sweep against the running server verified login → submit → reply →
  publish → search → thread → team CRUD → SEO.

## P. Documentation

- `cpanel-app/README.md` — product overview, stack, local dev, tests, features, layout.
- `cpanel-app/DEPLOY.md` — exact cPanel/DirectAdmin deployment steps & API reference.
- `README.md` (repo root) — ties repository together, explains architecture choice.
- `cpanel-app/.env.example` — documented environment variables.
- Inline docs across server modules (sqlite adapter rationale, FTS safety, auth fail-fast).

## Q. Remaining Issues / Notes

- **SMTP:** email is implemented and gracefully skipped when unconfigured; to enable
  notifications set the `SMTP_*` vars on the host. Not verifiable in this sandbox (no creds).
- **better-sqlite3 native build** is needed on cPanel; if the host lacks a compiler or offers
  Node 22.5+, the app runs on the built-in `node:sqlite`. Deployment docs note this.
- **File uploads** are out of scope for the MVP (the plan listed them but they were never
  implemented, and the unused `multer` was removed). The `uploads/` dir is reserved.
- **CSRF** is mitigated via `sameSite=lax` cookies + same-origin JSON posts (the standard,
  pragmatic approach for a single-process app); a CSRF token is not necessary given these
  constraints.
- **Business rule:** whether/when answers are published is a counselor decision, intentionally
  human-controlled (never auto-public).

## R. Deployment

See `cpanel-app/DEPLOY.md`. Summary: upload `cpanel-app/`, create a cPanel Node app pointing
at `app.js`, set env vars (`JWT_SECRET`, `ADMIN_BOOTSTRAP_*`, `PUBLIC_BASE_URL`, `SMTP_*`),
`npm install`, `npm run build`, restart. First boot creates the DB and seeds the admin.
