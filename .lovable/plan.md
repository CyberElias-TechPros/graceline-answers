# SoulConnect — cPanel/DirectAdmin Deployment Plan

## Hard constraint first
You're hosting on cPanel/DirectAdmin "Setup Node.js App" (Phusion Passenger). That rules out the current Lovable template (TanStack Start targeting Cloudflare Workers) and rules out Supabase/Vercel/Redis/S3. Everything must live in **one Node process** that Passenger can boot from a single `app.js` entry, using only the filesystem and a local DB.

I'll rebuild the project around a stack that runs cleanly there.

## Recommended stack (zero external paid services)

- **Runtime:** Node.js 20 (whatever your cPanel offers, 18+ works)
- **Server:** Express (Passenger-friendly, single entry file)
- **Frontend:** React + Vite SPA, built to static files, served by Express
- **Database:** SQLite via `better-sqlite3` (file on disk, no DB server needed; cPanel MySQL is a drop-in alternative if you prefer)
- **Auth:** JWT in httpOnly cookies (bcrypt for counselor passwords; seekers stay anonymous with a tracking token)
- **Realtime chat:** HTTP long-polling every 3s (Passenger's WebSocket support on shared hosting is unreliable — your own brief said polling is fine for MVP)
- **File uploads:** `multer` → local `/uploads` folder (cPanel gives you disk space)
- **Email:** `nodemailer` using your cPanel SMTP account (no Resend/SendGrid needed)
- **Search:** SQLite FTS5 (built in, no Typesense)
- **Process:** Passenger manages it; `app.js` just calls `app.listen(process.env.PORT)`

No Redis, no object storage, no managed DB, no edge functions. Everything the architecture diagram calls out is collapsed into this one process.

## Repo layout

```text
/app.js                 ← Passenger entry (requires dist server)
/server/
  index.js              ← Express app, mounts API + static SPA
  db.js                 ← better-sqlite3 init + migrations
  auth.js               ← JWT + bcrypt helpers, middleware
  routes/
    questions.js        ← submit, list, get-by-token
    messages.js         ← chat send + poll
    archive.js          ← public Q&A + FTS search
    admin.js            ← counselor inbox, reply, publish, sanitize
    prayer.js
    uploads.js
  mailer.js             ← nodemailer (cPanel SMTP)
  crisis.js             ← keyword detection → flag + banner payload
/client/                ← Vite React app
  src/pages/            ← Home, Ask, Thread (by token), Archive, Search,
                          Admin login, Admin inbox, Admin thread
/data/app.sqlite        ← created on first boot (gitignored)
/uploads/               ← user attachments (gitignored)
.env.example            ← JWT_SECRET, SMTP_*, ADMIN_BOOTSTRAP_EMAIL
```

## MVP feature scope (built first, in this order)

1. **Question submission** — anonymous (tracking token) or with email; categories; crisis keyword detection returns hotline banner.
2. **Seeker thread page** — `/t/:token` shows question + counselor reply + chat; polls `/api/messages?since=…` every 3s.
3. **Counselor admin** — login, inbox (new/active/resolved), open thread, reply, internal notes, sanitize-and-publish.
4. **Public archive** — list + FTS search + permalink (only sanitized public versions, never raw content).
5. **Email notifications** — counselor gets new-question email; seeker (if email given) gets reply email.

Phase 2 (after MVP works on your host): prayer requests, mentorship assignment, upvotes, AI-assisted triage.

## Privacy guardrails (engineered in from day 1)

- Anonymous submissions: **no IP, no UA, no fingerprint** stored — verified in the insert path.
- Public archive uses separate `public_title` / `public_content` columns; a question is never auto-public.
- Crisis keywords (`suicide`, `self-harm`, `abuse`, …) → flag row + UI banner with hotlines.
- Rate limit on submission endpoint (`express-rate-limit`, memory store).
- Disclaimers on submission and archive pages: "Not a substitute for professional therapy."

## Database (SQLite)

`users` (counselors only), `questions` (with `tracking_token`, `seeker_email` nullable, `raw_content`, `public_title`, `public_content`, `is_public`, `status`, `category`, `is_urgent`), `messages` (`question_id`, `sender_type`, `content`, `created_at`), `internal_notes`, `prayer_requests`, plus an FTS5 virtual table over `public_title || public_content`.

## cPanel/DirectAdmin deployment steps (what you do once)

1. cPanel → **Setup Node.js App** → Node 20, application root = your folder, application URL = your domain, **startup file = `app.js`**.
2. Upload the repo (Git Version Control or File Manager zip).
3. In the Node.js App panel: **Run NPM Install**, then add env vars: `JWT_SECRET`, `SMTP_HOST/PORT/USER/PASS`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`.
4. Run the build script (`npm run build`) from the panel's "Run JS script" — produces `client/dist`.
5. Restart the app. Passenger serves it on your domain.
6. First boot auto-creates `/data/app.sqlite`, runs migrations, seeds the bootstrap counselor account.

Updates later = upload changed files → Run NPM Install (if deps changed) → `npm run build` → Restart.

## What I'll do in this project now

1. Strip the TanStack Start / Cloudflare scaffolding.
2. Create the Express + Vite-React layout above with the MVP routes and pages wired end-to-end against SQLite.
3. Add `app.js` Passenger entry, `.env.example`, and a short `DEPLOY.md` with the cPanel steps.
4. Verify locally that `npm run build && node app.js` serves the full app on one port.

## One decision I need from you before I start

**Database choice on your cPanel:** SQLite file (simplest, zero config, recommended) or MySQL (cPanel gives you it for free, slightly more setup)? I'll default to **SQLite** unless you say MySQL.
