# Operations

## Scheduled work (cron)

- `17 * * * *` — unanswered-escalation digest: emails the team about questions unanswered for
  4h, urgent first.
- `30 3 * * *` — daily maintenance: prune the audit log and run the FTS integrity check,
  rebuilding the index if it reports corruption.

## Email

Email is enqueued on `EMAIL_QUEUE` (batch 10, 3 retries, 30s backoff) with a dead-letter queue
`graceline-email-dlq`. With `EMAIL_PROVIDER=log` messages go to the Worker log; swap in a real
provider by implementing the provider interface in `src/lib/email.ts`.

## Rate limits

Fixed-window limits in KV (`src/middleware/ratelimit.ts`), failing open if KV is unavailable.
Rules: login, question submit, seeker message, prayer submit, prayer count, archive search,
thread access. A 429 carries `retry-after`.

## Backups and data safety

D1 is the system of record; take scheduled D1 backups from the Cloudflare dashboard. The import
tool (below) never writes to its source.

## Importing legacy cPanel data

The legacy app is removed from the repository, but a one-way importer remains at
`worker/scripts/import-sqlite.ts`. It reads a legacy SQLite file and emits reviewable SQL:

```bash
cd worker
npx tsx scripts/import-sqlite.ts --source /path/to/legacy.sqlite --out import.sql
# review import.sql, then apply to an EMPTY local schema:
npx tsx scripts/import-sqlite.ts --source /path/to/legacy.sqlite --apply-local
# for production, apply the reviewed file:
npx wrangler d1 execute graceline-db --remote --file import.sql
```

Behaviour worth knowing before you run it:
- Users are imported **inactive** (legacy bcrypt hashes cannot be verified by the PBKDF2
  verifier). Reset each password from the console after bootstrapping a fresh admin.
- Public questions get computed slugs and are indexed by the schema triggers; private text is
  carried over but stays private.
- Internal notes whose author no longer exists are skipped and reported.
- The target must be an empty schema; a half-applied run is recovered by wiping and re-running.

## Local demo data

`npm run seed:local` populates the local D1 with published answers across every category, a few
awaiting-reply conversations, and prayer requests. It does not create an admin.
