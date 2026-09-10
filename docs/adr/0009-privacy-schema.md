# 0009 — Privacy as a schema property

**Status:** Accepted

## Context
The ministry's core promise is anonymity. A policy that merely says "we do not look at IPs"
can be broken by a future code change; a schema that has no such columns cannot.

## Decision
The D1 schema contains no IP, user-agent, device or fingerprint columns. Rate limiting derives
a key from the client address but stores only a hashed, expiring KV entry, never in D1. The
audit log records who did what, never where from.

## Consequences
- There is nothing sensitive to leak from the primary database.
- `test/` asserts the absence of such columns after migrations.
- The privacy page can state the guarantee factually, backed by schema.
