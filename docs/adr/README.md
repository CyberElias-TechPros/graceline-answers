# Architecture Decision Records

Short records of the decisions that shape the system. Status is *Accepted* unless noted.
The numbering is chronological, not by importance.

| ADR | Decision | Status |
| --- | -------- | ------ |
| 0001 | Two independently deployed units, same-origin API proxy | Accepted |
| 0002 | Frontend lives at repo root for direct Vercel deploy | Accepted |
| 0003 | `shared/site.ts` is the only taxonomy/limits source | Accepted |
| 0004 | First-party cookies via proxy; double-submit CSRF | Accepted |
| 0005 | PBKDF2-SHA256, not bcrypt, on the Worker | Accepted |
| 0006 | Durable Object long-poll instead of client polling | Accepted |
| 0007 | No R2 — there is no object-storage requirement | Accepted |
| 0008 | Public pages server-rendered; SEO data in first HTML | Accepted |
| 0009 | Privacy as a schema property (no IP/UA columns) | Accepted |
