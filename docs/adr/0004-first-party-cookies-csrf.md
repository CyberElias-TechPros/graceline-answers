# 0004 — First-party cookies with double-submit CSRF

**Status:** Accepted

## Context
The counselor console mutates state and must be protected from cross-site request forgery
without introducing CORS or fragile token plumbing into every form.

## Decision
Set two cookies, both `Path=/api`, `SameSite=Lax`: `gl_session` (HttpOnly JWT) and `gl_csrf`
(non-HttpOnly random token). Every mutating admin request must echo `gl_csrf` in an
`x-csrf-token` header, which the Worker verifies against the cookie.

## Consequences
- An attacker on another origin can cause the browser to send the cookies but cannot read
  `gl_csrf`, so it cannot forge the header.
- `SameSite=Lax` already blocks most cross-site POSTs; the header is defense in depth.
- The frontend reads `gl_csrf` from `document.cookie` and attaches it automatically.
