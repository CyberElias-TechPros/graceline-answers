import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

/**
 * Tests run against the real D1, KV and Durable Object implementations through
 * Miniflare, so a passing test means the SQL actually executed on SQLite rather
 * than that a mock was satisfied.
 *
 * The worker configuration is *derived* from `wrangler.jsonc` rather than
 * duplicated, so the bindings under test are always the ones production deploys
 * with. Two modifications are made:
 *
 *   1. The queue consumer is removed. Miniflare refuses to register the same
 *      consumer under two worker names, and this pool registers one per test
 *      file. `test/queue.test.ts` calls the real `queue()` handler directly
 *      instead, which asserts ack/retry behaviour — a stronger test than hoping
 *      a batch drained in time.
 *   2. `MIGRATIONS` is injected as a binding so `applyD1Migrations()` applies
 *      exactly the migrations `wrangler d1 migrations apply` runs.
 *
 * The derived file is a build artifact; it is regenerated on every run and
 * gitignored.
 */
const wranglerPath = fileURLToPath(new URL("./wrangler.jsonc", import.meta.url));
const testConfigPath = fileURLToPath(new URL("./wrangler.test.jsonc", import.meta.url));

const config = JSON.parse(
  readFileSync(wranglerPath, "utf8")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1"),
);
delete config.queues?.consumers;
writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

export default defineWorkersConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    /**
     * Files run one at a time. With isolated storage disabled every file shares
     * one database, so running them in parallel would let one file's
     * `beforeEach` wipe another's fixtures mid-test.
     */
    fileParallelism: false,
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.test.jsonc" },
        /**
         * One worker, serial execution, shared module cache. Required because the
         * Durable Object constraint above forces shared storage: parallel files
         * would race on the same database.
         */
        singleWorker: true,
        /**
         * Isolated storage is off because Durable Object tests are incompatible
         * with it (the pool asserts a `.sqlite` path; a DO opens `.sqlite-shm`).
         * `test/setup.ts` empties the database before each test instead, so tests
         * stay independent and order-proof.
         */
        isolatedStorage: false,
        miniflare: {
          bindings: {
            PUBLIC_SITE_URL: "https://graceline.test",
            SITE_NAME: "GraceLine Answers",
            ENVIRONMENT: "test",
            JWT_SECRET: "test-secret-that-is-long-enough-for-hmac-sha256-keys",
            ADMIN_BOOTSTRAP_EMAIL: "pastor@example.com",
            ADMIN_BOOTSTRAP_PASSWORD: "a-very-strong-pass-123",
            EMAIL_PROVIDER: "log",
            MIGRATIONS: await readD1Migrations(new URL("./migrations", import.meta.url).pathname),
          },
        },
      },
    },
  },
});
