# 0005 — PBKDF2-SHA256 instead of bcrypt on the Worker

**Status:** Accepted

## Context
Cloudflare Workers have a hard CPU-time budget per invocation. bcrypt is intentionally
CPU-heavy and its synchronous loops blow that budget; the legacy cPanel app used bcryptjs,
which is even slower in JS.

## Decision
Hash counselor passwords with PBKDF2-SHA256 via WebCrypto (210,000 iterations, 16-byte salt,
32-byte key), storing `pbkdf2-sha256$<iter>$<salt>$<key>`. Provide `needsRehash()` so a future
iteration bump re-hashes on next login, and use constant-time comparison.

## Consequences
- Verification stays within the Worker CPU budget.
- Legacy bcrypt hashes cannot be imported; the SQLite import brings users in as inactive and
  requires a password reset after the operator bootstraps a fresh admin.
