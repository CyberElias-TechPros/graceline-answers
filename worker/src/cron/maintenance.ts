import { unanswered } from "../db/conversation";
import { pruneAuditLog } from "../db/audit";
import { checkFtsIntegrity, rebuildFtsIndex } from "../db/archive";
import { listCounselorEmails } from "../db/users";
import { enqueueEmail } from "../lib/email";
import { logger } from "../lib/logging";
import type { Env } from "../types";

/**
 * Scheduled maintenance.
 *
 * Two crons, both idempotent so a retry or an overlapping run is harmless:
 *
 *   hourly  — escalate questions nobody has answered yet.
 *   daily   — prune the audit log past its retention window and verify the
 *             external-content FTS index has not drifted.
 */

const UNANSWERED_AFTER_MS = 4 * 60 * 60 * 1000; // 4 hours
const DEFAULT_AUDIT_RETENTION_DAYS = 365;

export async function runHourly(env: Env, now = Date.now()): Promise<void> {
  const waiting = await unanswered(env.DB, { olderThanMs: UNANSWERED_AFTER_MS, now, limit: 50 });
  if (waiting.length === 0) {
    logger.info("cron_hourly_nothing_waiting");
    return;
  }

  const recipients = await listCounselorEmails(env.DB);
  if (recipients.length === 0) {
    logger.warn("cron_hourly_no_recipients", { waiting: waiting.length });
    return;
  }

  // Urgent conversations are escalated first and called out in the subject line
  // by the email renderer.
  const ordered = [...waiting].sort((a, b) => Number(b.isUrgent) - Number(a.isUrgent));
  await enqueueEmail(env, {
    type: "urgent_escalation_digest",
    to: recipients,
    questionIds: ordered.map((q) => q.id),
    createdAt: now,
  });

  logger.info("cron_hourly_escalated", {
    count: ordered.length,
    urgent: ordered.filter((q) => q.isUrgent).length,
    recipients: recipients.length,
  });
}

export async function runDaily(env: Env, now = Date.now()): Promise<void> {
  const retentionDays = Number(env.AUDIT_RETENTION_DAYS ?? DEFAULT_AUDIT_RETENTION_DAYS);
  const pruned = Number.isFinite(retentionDays) && retentionDays > 0
    ? await pruneAuditLog(env.DB, retentionDays, now)
    : 0;

  if (pruned > 0) {
    await import("../db/audit").then(({ recordAudit }) =>
      recordAudit(env.DB, {
        actor: null,
        action: "maintenance.pruned_audit",
        meta: { pruned, retention_days: retentionDays },
        now,
      }),
    );
  }

  // External-content FTS tables are the one SQLite structure that can silently
  // disagree with its source table, so verify and rebuild rather than trust.
  const healthy = await checkFtsIntegrity(env.DB);
  if (!healthy) {
    await rebuildFtsIndex(env.DB);
    await import("../db/audit").then(({ recordAudit }) =>
      recordAudit(env.DB, {
        actor: null,
        action: "maintenance.fts_rebuilt",
        meta: { reason: "integrity_check_failed" },
        now,
      }),
    );
    logger.warn("cron_daily_fts_rebuilt");
  }

  logger.info("cron_daily_complete", { audit_pruned: pruned, fts_healthy: healthy });
}
