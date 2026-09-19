# Deploying GraceLine Answers to Cloudflare

Prerequisites: a Cloudflare account with an eligible plan (Workers + D1 + KV +
Email Service), and `wrangler` authenticated (`npx wrangler login`).

## 1. Create the resources

```bash
cd cloudflare
npx wrangler d1 create graceline-answers-db
npx kv namespace create graceline-ratelimit
```

Copy the printed ids into `wrangler.jsonc`:

```jsonc
"d1_databases": [
  { "binding": "DB", "database_name": "graceline-answers-db", "database_id": "<d1-id>" }
],
"kv_namespaces": [
  { "binding": "KV", "id": "<kv-id>" }
],
```

## 2. Email Service (optional but recommended)

1. Enable email sending for your domain:

   ```bash
   npx wrangler email sending enable yourdomain.com
   ```

2. Update the `send_email` binding in `wrangler.jsonc`:

   ```jsonc
   "send_email": [
     { "name": "MAIL", "destination_address": "counselors@yourdomain.com" }
   ],
   ```

3. Set the sender address (must be on the enabled domain):

   ```bash
   npx wrangler secret put EMAIL_FROM   # e.g. notifications@yourdomain.com
   ```

   Until email is configured the worker still works — sends are skipped with a log line.

## 3. Secrets & variables

```bash
npx wrangler secret put JWT_SECRET                # >= 32 chars, required
npx wrangler secret put ADMIN_BOOTSTRAP_EMAIL     # first-boot admin, e.g. you@yourdomain.com
npx wrangler secret put ADMIN_BOOTSTRAP_PASSWORD  # strong; change it after first login
```

In `wrangler.jsonc` `vars`, set:

```jsonc
"vars": {
  "SITE_NAME": "GraceLine Answers",
  "PUBLIC_BASE_URL": "https://yourdomain.com"
}
```

## 4. Build & deploy

```bash
npm run client:build   # builds the shared React SPA into ../cpanel-app/client/dist
npm run deploy         # deploys worker + assets
```

## 5. Migrations

```bash
npx wrangler d1 migrations apply graceline-answers-db
```

## 6. Verify

- `https://yourdomain.com/api/health` → `{"ok":true,...,"services":{"d1":true,"kv":true}}`
- `https://yourdomain.com/` → cinematic home page
- Log in at `/admin/inbox` with the bootstrap credentials, then create real
  counselors on the **Team** page and change/delete the bootstrap account.

## Operational notes

- **Backups:** `wrangler d1 export graceline-answers-db` (schedule it).
- **Observability:** enabled in `wrangler.jsonc`; dashboard → Workers → observability.
- **Rate limits** live in KV and expire automatically (fixed windows).
- **Privacy:** anonymous submissions store no IP/UA/fingerprint — the schema has no
  column for them. Public archive only ever contains counselor-sanitized copies.
- **Crisis:** keyword hits flag the question urgent, notify the counselor pool
  (email), and surface a hotline banner to the seeker.
