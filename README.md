# GraceLine Answers

**Anonymous Bible Q&A and faith-centered Christian counseling** — a production-ready,
self-contained web application designed to deploy on **cPanel / DirectAdmin shared
hosting** as a single Node.js process.

People can ask Bible and life questions **completely anonymously**, receive a private,
scripture-based reply from a real counselor, and browse a searchable archive of
anonymized answers. There is also a community prayer wall.

---

## The deployable application lives in [`cpanel-app/`](./cpanel-app)

That folder is the actual product — an **Express + React/Vite + SQLite** application that
runs from a single `app.js` entry point that Phusion Passenger can boot. It needs no
external database, no Redis, no object storage, no managed task queue, and no third-party
email service. It uses only the filesystem and a local SQLite file.

- [cpanel-app/README.md](./cpanel-app/README.md) — Product overview, stack, local dev, tests.
- [cpanel-app/DEPLOY.md](./cpanel-app/DEPLOY.md) — Exact cPanel / DirectAdmin deployment steps.

## Why this architecture?

The repository's own deployment plan (`.lovable/plan.md`) and the deployment docs
explicitly mandate a **single Node.js process on cPanel/DirectAdmin shared hosting**, and
rule out Supabase/Vercel/Redis/S3/edge functions (Passenger on shared hosting doesn't
support Cloudflare Workers or a managed DB, and the brief called for zero external paid
services). Honouring that documented constraint:

- **Everything runs in one process** Express serves the JSON API and the pre-built SPA.
- **SQLite** (`better-sqlite3`, with an automatic fallback to Node's built-in `node:sqlite`)
  is the database — a file on disk, no DB server required.
- **No external infrastructure** — no Redis, no object storage, no third-party email
  service (Nodemailer uses your cPanel SMTP account).

## Product capabilities

- Anonymous question submission (IP/UA never stored), crisis-keyword detection with
  hotline banners.
- Private threaded conversation via a shareable tracking link (3s HTTP polling).
- Counselor console: inbox, reply, internal notes, status, sanitize-and-publish.
- Admin team management: add/remove counselors, reset passwords, assign roles.
- Public, searchable archive (SQLite FTS5); only hand-sanitized content is indexed.
- Prayer wall with a "I prayed" counter.
- Email notifications via cPanel SMTP.
- Security: JWT in httpOnly cookies, bcrypt hashing, rate limiting, security headers
  (CSP in production), server-side validation, IDOR-safe authorization.
- SEO: robots.txt, XML sitemap, RSS feed, and server-injected per-page metadata +
  JSON-LD (Organization / QAPage / BreadcrumbList) for public pages.

## Repository layout

```
cpanel-app/           The deployable application (Express + React/Vite + SQLite)
.lovable/plan.md      Original deployment plan & product brief
src/                  (Lovable scaffold informational page — not the deploy target)
```

## Test status

`npm test` in `cpanel-app/` runs 21 integration tests against an in-memory SQLite
database, covering auth, submission, messaging, publishing, archive search, prayer,
robots, sitemap, and SPA meta injection. All pass.
