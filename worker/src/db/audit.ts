/**
 * Audit log for privileged actions.
 *
 * Records actor, action, resource and timestamp. It deliberately stores no IP
 * address, no user-agent and no message content — enough to answer "who changed
 * what, and when" without turning the log into a second copy of the sensitive
 * data we promised seekers we would not keep.
 *
 * Fire-and-forget by design: an audit write failing must never roll back or
 * delay the action the counselor actually asked for, so failures are logged and
 * swallowed.
 */

export type AuditAction =
  | "admin.login"
  | "admin.login_failed"
  | "admin.logout"
  | "question.publish"
  | "question.unpublish"
  | "question.status"
  | "question.assign"
  | "question.note"
  | "question.reply"
  | "team.create"
  | "team.role_change"
  | "team.deactivate"
  | "team.activate"
  | "team.delete"
  | "team.password_reset"
  | "prayer.hide"
  | "prayer.unhide"
  | "maintenance.pruned_audit"
  | "maintenance.fts_rebuilt";

export type AuditActor = { id: string; email: string } | null;

export async function recordAudit(
  db: D1Database,
  entry: {
    actor: AuditActor;
    action: AuditAction;
    resourceType?: string;
    resourceId?: string | number;
    meta?: Record<string, unknown>;
    now: number;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_log (actor_id, actor_email, action, resource_type, resource_id, meta, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(
        entry.actor?.id ?? null,
        entry.actor?.email ?? null,
        entry.action,
        entry.resourceType ?? null,
        entry.resourceId === undefined ? null : String(entry.resourceId),
        entry.meta ? JSON.stringify(entry.meta).slice(0, 2000) : null,
        entry.now,
      )
      .run();
  } catch (cause) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "audit_write_failed",
        action: entry.action,
        error: cause instanceof Error ? cause.message : String(cause),
      }),
    );
  }
}

export async function listAudit(
  db: D1Database,
  options: { limit: number; cursor?: number | null; resourceType?: string },
) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.resourceType) {
    conditions.push("resource_type = ?");
    params.push(options.resourceType);
  }
  if (options.cursor) {
    conditions.push("id < ?");
    params.push(options.cursor);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db
    .prepare(
      `SELECT id, actor_id, actor_email, action, resource_type, resource_id, meta, created_at
         FROM audit_log ${where} ORDER BY id DESC LIMIT ?`,
    )
    .bind(...params, options.limit + 1)
    .all<{
    id: number;
    actor_id: string | null;
    actor_email: string | null;
    action: string;
    resource_type: string | null;
    resource_id: string | null;
    meta: string | null;
    created_at: number;
  }>();

  const hasMore = rows.results.length > options.limit;
  const page = hasMore ? rows.results.slice(0, options.limit) : rows.results;
  return {
    items: page.map((row) => ({
      id: row.id,
      actorEmail: row.actor_email,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      meta: safeParse(row.meta),
      createdAt: row.created_at,
    })),
    hasMore,
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Retention pruning, run by the daily cron. Returns the number of rows removed. */
export async function pruneAuditLog(db: D1Database, retentionDays: number, now: number): Promise<number> {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const result = await db.prepare(`DELETE FROM audit_log WHERE created_at < ?1`).bind(cutoff).run();
  return Number(result.meta.changes ?? 0);
}

function safeParse(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
