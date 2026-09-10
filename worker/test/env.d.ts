/// <reference types="@cloudflare/vitest-pool-workers" />

import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";
import type { Env } from "../src/types";

/**
 * The worker runtime exposes its bindings through `cloudflare:test`. This
 * augmentation tells TypeScript which of our own bindings exist there, plus
 * MIGRATIONS, which only exists in tests (it is how the suite applies the same
 * D1 migrations that `wrangler d1 migrations apply` runs in production).
 */
declare module "cloudflare:test" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface ProvidedEnv extends Env {
    MIGRATIONS: D1Migration[];
  }
}
