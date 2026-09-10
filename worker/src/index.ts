import { createApp } from "./app";
import { deliverEmail } from "./lib/email";
import { logger, setLogLevel } from "./lib/logging";
import { runDaily, runHourly } from "./cron/maintenance";
import { ThreadRoom } from "./do/thread";
import type { EmailJob, Env } from "./types";

/**
 * GraceLine Answers API — Cloudflare Worker entry point.
 *
 * One deployment serves four surfaces:
 *   fetch      the HTTP API (called same-origin by the Vercel frontend)
 *   queue      asynchronous outbound email, with retries and a dead-letter queue
 *   scheduled  hourly escalation and daily maintenance
 *   ThreadRoom the Durable Object backing live conversation delivery
 */

const app = createApp();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setLogLevel(env.ENVIRONMENT === "production" ? "info" : "debug");
    return app.fetch(request, env, ctx);
  },

  /**
   * Email delivery.
   *
   * A message that fails is retried by the queue and, once retries are
   * exhausted, routed to `graceline-email-dlq` so an operator can inspect it.
   * We never throw from `batch` for a poison message: `ack` it and log, because
   * redelivering a permanently-invalid address forever blocks the queue.
   */
  async queue(batch: MessageBatch<EmailJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await deliverEmail(env, message.body);
        message.ack();
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        logger.error("email_delivery_failed", {
          job_type: message.body?.type ?? "unknown",
          attempts: message.attempts,
          error: detail,
        });
        // Permanent client errors (4xx) will not succeed on retry.
        const permanent = /email_provider_error 4\d\d/.test(detail);
        if (permanent) {
          message.ack();
        } else {
          message.retry();
        }
      }
    }
  },

  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    setLogLevel("info");
    const now = Date.now();
    const isDaily = event.cron.includes("30 3");
    logger.info("cron_started", { cron: event.cron, daily: isDaily });
    try {
      await (isDaily ? runDaily(env, now) : runHourly(env, now));
    } catch (cause) {
      // Log and exit cleanly: a cron that throws is retried by the platform, and
      // an unhandled rejection here would surface as a failed trigger with no
      // context attached.
      logger.error("cron_failed", {
        cron: event.cron,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  },
} satisfies ExportedHandler<Env, EmailJob, EmailJob>;

export { ThreadRoom };
