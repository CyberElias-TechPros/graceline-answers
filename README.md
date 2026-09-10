# GraceLine Answers

**Anonymous Bible Q&A and faith-centered Christian counseling.**

People ask Bible and life questions **completely anonymously**, receive a private,
scripture-based reply from a real counselor on a tracking-token thread, and — with the
counselor's rewrite — a question may later appear in a searchable public archive. There is
also a community prayer wall.

The product runs as **two independently deployed units**:

- **Frontend** (this directory) — TanStack Start / React 19 on **Vercel**. Server-renders every
  public page for SEO; hosts the seeker thread and the counselor console.
- **API** (`worker/`) — a **Cloudflare Worker** (Hono) backed by **D1**, **KV**, a
  **Durable Object** for realtime, **Queues** for email, and **Cron** for scheduled work.

The frontend proxies `/api/*`, `/robots.txt`, `/sitemap.xml` and `/feed.xml` to the Worker so
the browser sees a single origin (first-party cookies, no CORS). See
[`docs/architecture.md`](./docs/architecture.md).

> The previous cPanel/Express implementation has been removed. A one-way importer for its
> SQLite data remains at `worker/scripts/import-sqlite.ts` (see
> [`docs/operations.md`](./docs/operations.md)).

---

## Repository layout

```
├── src/                  # Frontend (TanStack Start). Deploys to Vercel.
│   ├── server.ts         # Nitro entry: /api proxy + SSR error normalisation
│   ├── routes/           # Public pages, thread, and /admin console
│   ├── components/       # Design-system components
│   ├── lib/              # api client, seo/json-ld, formatting
│   └── styles.css        # GraceLine design tokens + primitives
├── public/               # favicon, apple-touch-icon, og image, webmanifest
├── shared/site.ts        # SINGLE source of categories/limits/crisis keywords
├── worker/               # Cloudflare Worker API + tests + migrations + scripts
│   ├── src/              # routes, db, middleware, DO, cron, email
│   ├── test/             # 102 tests (vitest + @cloudflare/vitest-pool-workers)
│   ├── migrations/       # D1 schema (0001_init.sql)
│   └── scripts/          # seed.ts, import-sqlite.ts
├── docs/                 # architecture, deployment, operations, adr/
└── vercel.json           # Vercel framework + security headers
```

## Local development

```bash
# API (worker/)
cd worker
cp .dev.vars.example .dev.vars      # set JWT_SECRET + bootstrap credentials
npm install
npx wrangler d1 migrations apply graceline-db --local
npm run seed:local                  # optional demo content
npm run dev                         # http://127.0.0.1:8787

# Frontend (repo root, separate terminal)
npm install
npm run dev                         # http://localhost:3000 (proxies /api to :8787)
```

Counselor console: `http://localhost:3000/admin/login` using the
`ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` from `worker/.dev.vars` (created on first
sign-in while the users table is empty).

## Verification

- API: `cd worker && npm run test` — 102 tests across public, admin, realtime, queue, units and
  seo suites, run against real miniflare D1/KV/DO/Queue bindings.
- API types: `cd worker && npx tsc --noEmit`.
- Frontend: `npm run build` — emits the Vercel serverless output (`.output` / `.vercel`).

## Key properties

- **Anonymity by schema**: no IP / user-agent / device / fingerprint columns anywhere.
- **Nothing auto-publishes**: an answer is indexable only when a counselor sets `is_public`
  and fills all three rewritten fields.
- **Same-origin security**: HttpOnly `gl_session` + double-submit `gl_csrf`, `SameSite=Lax`,
  `Path=/api`; enumeration-resistant login; per-route rate limits that fail open.
- **SEO first-class**: SSR pages, canonicals, robots, sitemap, feed and valid JSON-LD in the
  first HTML response. No ranking guarantees are made or implied.

For the decision trail see [`docs/adr/`](./docs/adr/).
