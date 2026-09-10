# Deployment

Two units deploy independently. Environment variables are the only coupling.

## 1. Cloudflare Worker (`worker/`)

1. Create the resources and put their ids in `worker/wrangler.jsonc`
   (`d1_databases[0].database_id`, `kv_namespaces[0].id`,
   `durable_objects.bindings[0]` class is already wired). Create the queue
   `graceline-email` and DLQ `graceline-email-dlq` if not auto-provisioned.
2. Set secrets (never in a file for production):
   - `JWT_SECRET` — HS256 key, ≥32 chars. `wrangler secret put JWT_SECRET`
   - `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` — one-time first-admin bootstrap.
   - `EMAIL_PROVIDER` / `EMAIL_FROM` — e.g. a real provider or `log`.
3. `wrangler d1 migrations apply graceline-db --remote`
4. Optionally import legacy data first (see `operations.md`), then deploy:
   `wrangler deploy`.
5. Sign in once to bootstrap the admin, then change that password in the console.

`vars` in `wrangler.jsonc`: `PUBLIC_SITE_URL` (the canonical frontend origin), `SITE_NAME`,
`ENVIRONMENT`.

## 2. Frontend (repo root, Vercel)

- `vercel.json` sets the Vite framework and security headers; the build emits a Vercel
  serverless function (`nitro.preset = "vercel"` in `vite.config.ts`).
- Set the env var `API_ORIGIN` to the deployed Worker URL. The server entry proxies `/api/*`,
  `/robots.txt`, `/sitemap.xml`, `/feed.xml` to it.
- Optionally set `VITE_SITE_URL` for client-side absolute URLs (defaults to the request origin
  during SSR; `http://localhost:3000` in dev).
- Deploy with `vercel build` (or connect the repo in the Vercel dashboard; build command
  `npm run build`, output `.output`).

## Local development

```bash
# API
cd worker
cp .dev.vars.example .dev.vars        # fill JWT_SECRET + bootstrap creds
npm i
npx wrangler d1 migrations apply graceline-db --local
npm run seed:local                    # optional demo content
npm run dev                           # :8787

# Frontend (separate terminal, repo root)
npm i
npm run dev                           # :3000, proxies /api -> :8787
```
