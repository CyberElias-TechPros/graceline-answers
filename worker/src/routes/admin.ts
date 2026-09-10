import { Hono } from "hono";
import type { Context } from "hono";
import { buildPublicSlug, generateCsrfToken } from "../lib/tokens";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logging";
import { RULES } from "../lib/ratelimit";
import { rateLimit } from "../middleware/ratelimit";
import {
  buildCookie,
  buildDeletedCookie,
  CSRF_COOKIE,
  resolveJwtSecret,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
} from "../lib/session";
import { requireAuth, requireCsrf, requireRole } from "../middleware/auth";
import {
  authenticate,
  countAdmins,
  createUser,
  deleteUser,
  findByEmail,
  findById,
  listCounselorEmails,
  listTeam,
  setActive,
  setRole,
  toPublicUser,
  updatePasswordHash,
} from "../db/users";
import {
  appendNote,
  listInbox,
  listMessages,
  listNotes,
  markCounselorRead,
  publishQuestion,
  setAssignment,
  setStatus,
  toAdminThreadView,
} from "../db/conversation";
import { countByStatus, findById as findQuestionById, responseTimeStats } from "../db/questions";
import { recordAudit, listAudit, type AuditActor } from "../db/audit";
import { setHidden } from "../db/prayer";
import {
  inboxQuerySchema,
  loginSchema,
  noteSchema,
  parse,
  parseIdParam,
  passwordResetSchema,
  publishSchema,
  statusSchema,
  teamCreateSchema,
} from "../lib/validation";
import type { AppContext } from "../app";
import type { Env } from "../types";

/**
 * Counselor console API.
 *
 * Everything below `/login` runs behind `requireAuth` (a valid session for an
 * *active* account), and everything that mutates also runs behind `requireCsrf`.
 * Role checks are on the server; the frontend only hides buttons.
 */
export function adminRoutes(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  const isSecure = (c: Context<AppContext>) =>
    new URL(c.req.url).protocol === "https:" || c.env.ENVIRONMENT === "production";

  // -------------------------------------------------------------------------
  // Session
  // -------------------------------------------------------------------------

  app.post("/login", rateLimit(RULES.login), async (c) => {
    const body = parse(loginSchema, await c.req.json().catch(() => ({})));
    const now = Date.now();
    const email = body.email.trim().toLowerCase();

    // First-run bootstrap: with an empty users table, the credentials in the
    // environment become the first administrator. This is the only path that
    // creates an account from env, and it can never fire twice.
    await bootstrapIfEmpty(c.env, email, body.password, now);

    const outcome = await authenticate(c.env.DB, email, body.password, now);

    if (!outcome.ok) {
      await recordAudit(c.env.DB, {
        actor: null,
        action: "admin.login_failed",
        resourceType: "user",
        resourceId: email,
        meta: { reason: outcome.reason },
        now,
      });
      if (outcome.reason === "locked") {
        throw AppError.rateLimited(outcome.retryAfterSeconds ?? 900);
      }
      // One message for every failure mode: this endpoint must not reveal which
      // emails have accounts.
      throw AppError.unauthorized("That email and password do not match our records.");
    }

    const { secret, warned } = resolveJwtSecret(c.env.JWT_SECRET, c.env.ENVIRONMENT ?? "development");
    if (warned) logger.warn("jwt_secret_generated_for_development");

    const token = await signSession(outcome.user, secret);
    const csrf = generateCsrfToken();

    await recordAudit(c.env.DB, {
      actor: { id: outcome.user.id, email: outcome.user.email },
      action: "admin.login",
      resourceType: "user",
      resourceId: outcome.user.id,
      now,
    });

    // `append: true` is essential: without it the second call overwrites the
    // first and the session cookie never reaches the browser.
    c.header(
      "set-cookie",
      buildCookie(SESSION_COOKIE, token, {
        secure: isSecure(c),
        maxAgeSeconds: SESSION_TTL_SECONDS,
      }),
      { append: true },
    );
    c.header(
      "set-cookie",
      buildCookie(CSRF_COOKIE, csrf, {
        secure: isSecure(c),
        maxAgeSeconds: SESSION_TTL_SECONDS,
        httpOnly: false,
      }),
      { append: true },
    );

    return c.json({ user: outcome.user, csrf });
  });

  app.post("/logout", async (c) => {
    const user = c.get("user");
    const secure = isSecure(c);
    c.header("set-cookie", buildDeletedCookie(SESSION_COOKIE, secure), { append: true });
    c.header("set-cookie", buildDeletedCookie(CSRF_COOKIE, secure), { append: true });
    if (user) {
      await recordAudit(c.env.DB, {
        actor: { id: user.id, email: user.email },
        action: "admin.logout",
        resourceType: "user",
        resourceId: user.id,
        now: Date.now(),
      });
    }
    return c.json({ ok: true });
  });

  app.get("/me", async (c) => {
    const user = c.get("user");
    return c.json({ user: user ?? null });
  });

  // -------------------------------------------------------------------------
  // Everything below requires an active session.
  // -------------------------------------------------------------------------
  app.use("*", requireAuth);

  app.get("/stats", async (c) => {
    const [counts, timing] = await Promise.all([countByStatus(c.env.DB), responseTimeStats(c.env.DB)]);
    const team = await listTeam(c.env.DB);
    return c.json({
      ...counts,
      counselors: team.length,
      medianResponseMinutes: timing.medianMinutes,
      answeredCount: timing.answeredCount,
    });
  });

  app.get("/inbox", async (c) => {
    const query = parse(inboxQuerySchema, {
      status: c.req.query("status") ?? undefined,
      urgent: c.req.query("urgent") ?? undefined,
      q: c.req.query("q") ?? undefined,
      limit: c.req.query("limit") ?? undefined,
      cursor: c.req.query("cursor") ?? undefined,
    });
    const page = await listInbox(c.env.DB, {
      status: query.status,
      urgentOnly: query.urgent,
      query: query.q,
      limit: query.limit,
      cursor: query.cursor ?? null,
    });
    return c.json(page);
  });

  app.get("/questions/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const question = await findQuestionById(c.env.DB, id);
    if (!question) throw AppError.notFound("That conversation does not exist.");

    const [messages, notes] = await Promise.all([
      listMessages(c.env.DB, id, 0),
      listNotes(c.env.DB, id),
    ]);

    await markCounselorRead(c.env.DB, id, Date.now());

    return c.json({
      question: toAdminThreadView(question),
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender_type,
        content: m.content,
        createdAt: m.created_at,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        content: n.content,
        authorName: n.author_name,
        createdAt: n.created_at,
      })),
      lastMessageId: messages.length ? messages[messages.length - 1]!.id : 0,
    });
  });

  // --- Mutations: CSRF from here on -----------------------------------------
  app.use("/*", requireCsrf);

  app.post("/questions/:id/notes", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const body = parse(noteSchema, await c.req.json().catch(() => ({})));
    const question = await findQuestionById(c.env.DB, id);
    if (!question) throw AppError.notFound("That conversation does not exist.");

    const user = actor(c);
    const now = Date.now();
    const noteId = await appendNote(c.env.DB, { questionId: id, authorId: user.id, content: body.content, now });
    await recordAudit(c.env.DB, {
      actor: user,
      action: "question.note",
      resourceType: "question",
      resourceId: id,
      now,
    });
    return c.json({ id: noteId, createdAt: now }, 201);
  });

  app.post("/questions/:id/status", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const body = parse(statusSchema, await c.req.json().catch(() => ({})));
    const changed = await setStatus(c.env.DB, id, body.status, Date.now());
    if (!changed) throw AppError.notFound("That conversation does not exist.");
    await recordAudit(c.env.DB, {
      actor: actor(c),
      action: "question.status",
      resourceType: "question",
      resourceId: id,
      meta: { status: body.status },
      now: Date.now(),
    });
    return c.json({ ok: true, status: body.status });
  });

  app.post("/questions/:id/assign", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const payload = (await c.req.json().catch(() => ({}))) as { user_id?: unknown };
    const userId = payload.user_id === null || payload.user_id === undefined ? null : String(payload.user_id);

    if (userId) {
      const target = await findById(c.env.DB, userId);
      if (!target || target.is_active !== 1) throw AppError.badRequest("That counselor is not available.");
    }
    const question = await findQuestionById(c.env.DB, id);
    if (!question) throw AppError.notFound("That conversation does not exist.");

    await setAssignment(c.env.DB, id, userId, Date.now());
    await recordAudit(c.env.DB, {
      actor: actor(c),
      action: "question.assign",
      resourceType: "question",
      resourceId: id,
      meta: { assigned_to: userId },
      now: Date.now(),
    });
    return c.json({ ok: true, assignedTo: userId });
  });

  /** Sanitize and publish (or unpublish) an answer. */
  app.post("/questions/:id/publish", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const body = parse(publishSchema, await c.req.json().catch(() => ({})));
    const question = await findQuestionById(c.env.DB, id);
    if (!question) throw AppError.notFound("That conversation does not exist.");

    const user = actor(c);
    const now = Date.now();
    const wantsPublic = body.is_public === true;

    let slug = question.public_slug;
    if (wantsPublic && body.public_title) {
      slug = await uniqueSlug(c.env.DB, body.public_title, id, question.public_slug);
    }

    await publishQuestion(c.env.DB, {
      questionId: id,
      publicTitle: body.public_title ?? null,
      publicContent: body.public_content ?? null,
      publicAnswer: body.public_answer ?? null,
      category: body.category ?? null,
      slug: wantsPublic ? slug : null,
      isPublic: wantsPublic,
      publishedBy: user.id,
      now,
    });

    await recordAudit(c.env.DB, {
      actor: user,
      action: wantsPublic ? "question.publish" : "question.unpublish",
      resourceType: "question",
      resourceId: id,
      meta: { slug: wantsPublic ? slug : null, category: body.category ?? null },
      now,
    });

    logger.info(wantsPublic ? "question_published" : "question_unpublished", {
      question_id: id,
      actor: user.email,
      slug: wantsPublic ? slug : null,
    });

    return c.json({ ok: true, published: wantsPublic, slug: wantsPublic ? slug : null });
  });

  // --- Team management (admin only) -----------------------------------------

  app.get("/team", requireRole("admin"), async (c) => {
    const rows = await listTeam(c.env.DB);
    return c.json({
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        isActive: row.is_active === 1,
        lastLoginAt: row.last_login_at,
        createdAt: row.created_at,
      })),
    });
  });

  app.post("/team", requireRole("admin"), async (c) => {
    const body = parse(teamCreateSchema, await c.req.json().catch(() => ({})));
    if (await findByEmail(c.env.DB, body.email)) {
      throw AppError.conflict("Someone already has an account with that email.");
    }
    const created = await createUser(c.env.DB, {
      email: body.email,
      name: body.name ?? null,
      password: body.password,
      role: body.role,
      now: Date.now(),
    });
    await recordAudit(c.env.DB, {
      actor: actor(c),
      action: "team.create",
      resourceType: "user",
      resourceId: created.id,
      meta: { email: created.email, role: created.role },
      now: Date.now(),
    });
    return c.json(created, 201);
  });

  app.patch("/team/:id", requireRole("admin"), async (c) => {
    const id = c.req.param("id");
    const payload = (await c.req.json().catch(() => ({}))) as { role?: unknown; is_active?: unknown };
    const target = await findById(c.env.DB, id);
    if (!target) throw AppError.notFound("That counselor does not exist.");

    const now = Date.now();
    const me = actor(c);

    if (payload.role === "admin" || payload.role === "counselor") {
      if (target.role === "admin" && payload.role === "counselor" && (await countAdmins(c.env.DB)) <= 1) {
        throw AppError.conflict("There must always be at least one administrator.");
      }
      await setRole(c.env.DB, id, payload.role, now);
      await recordAudit(c.env.DB, {
        actor: me,
        action: "team.role_change",
        resourceType: "user",
        resourceId: id,
        meta: { from: target.role, to: payload.role },
        now,
      });
    }

    if (typeof payload.is_active === "boolean" && payload.is_active !== (target.is_active === 1)) {
      if (!payload.is_active && target.role === "admin" && (await countAdmins(c.env.DB)) <= 1) {
        throw AppError.conflict("There must always be at least one active administrator.");
      }
      await setActive(c.env.DB, id, payload.is_active, now);
      await recordAudit(c.env.DB, {
        actor: me,
        action: payload.is_active ? "team.activate" : "team.deactivate",
        resourceType: "user",
        resourceId: id,
        now,
      });
    }

    return c.json({ ok: true });
  });

  app.post("/team/:id/password", requireRole("admin"), async (c) => {
    const id = c.req.param("id");
    const body = parse(passwordResetSchema, await c.req.json().catch(() => ({})));
    const target = await findById(c.env.DB, id);
    if (!target) throw AppError.notFound("That counselor does not exist.");
    await updatePasswordHash(c.env.DB, id, body.password, Date.now());
    await recordAudit(c.env.DB, {
      actor: actor(c),
      action: "team.password_reset",
      resourceType: "user",
      resourceId: id,
      now: Date.now(),
    });
    return c.json({ ok: true });
  });

  app.delete("/team/:id", requireRole("admin"), async (c) => {
    const id = c.req.param("id");
    const me = actor(c);
    if (id === me.id) throw AppError.badRequest("You cannot remove your own account.");

    const target = await findById(c.env.DB, id);
    if (!target) throw AppError.notFound("That counselor does not exist.");
    if (target.role === "admin" && (await countAdmins(c.env.DB)) <= 1) {
      throw AppError.conflict("There must always be at least one administrator.");
    }

    await deleteUser(c.env.DB, id);
    await recordAudit(c.env.DB, {
      actor: me,
      action: "team.delete",
      resourceType: "user",
      resourceId: id,
      meta: { email: target.email },
      now: Date.now(),
    });
    return c.json({ ok: true });
  });

  // --- Moderation ------------------------------------------------------------

  app.post("/prayer/:id/hide", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const payload = (await c.req.json().catch(() => ({}))) as { hidden?: unknown };
    const hidden = payload.hidden !== false;
    const changed = await setHidden(c.env.DB, id, hidden);
    if (!changed) throw AppError.notFound("That prayer request does not exist.");
    await recordAudit(c.env.DB, {
      actor: actor(c),
      action: hidden ? "prayer.hide" : "prayer.unhide",
      resourceType: "prayer",
      resourceId: id,
      now: Date.now(),
    });
    return c.json({ ok: true, hidden });
  });

  app.get("/audit", requireRole("admin"), async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 200);
    const cursor = c.req.query("cursor") ? Number(c.req.query("cursor")) : null;
    if (cursor !== null && !Number.isSafeInteger(cursor)) throw AppError.badRequest("That cursor is not valid.");
    const page = await listAudit(c.env.DB, {
      limit,
      cursor,
      resourceType: c.req.query("resource_type") ?? undefined,
    });
    return c.json(page);
  });

  /** Counselor list for the assignment dropdown (any authenticated role). */
  app.get("/counselors", async (c) => {
    const rows = await listTeam(c.env.DB);
    return c.json({
      items: rows
        .filter((row) => row.is_active === 1)
        .map((row) => ({ id: row.id, name: row.name ?? row.email, role: row.role })),
    });
  });

  return app;
}

/**
 * The signed-in counselor, guaranteed present by `requireAuth`.
 *
 * Throws rather than returning null so a mutation route that forgets the
 * middleware fails loudly instead of writing an anonymous audit entry.
 */
function actor(c: { get: (key: "user") => unknown }): { id: string; email: string } {
  const user = c.get("user") as { id: string; email: string } | null;
  if (!user) throw AppError.unauthorized();
  return { id: user.id, email: user.email };
}

/**
 * Generate a slug that does not collide with an existing published answer.
 *
 * Two questions can legitimately share a title, so the numeric suffix usually
 * settles it; if that also collides (a deleted-and-reused id) we append a
 * counter rather than failing the publish.
 */
async function uniqueSlug(
  db: D1Database,
  publicTitle: string,
  questionId: number,
  existing: string | null,
): Promise<string> {
  const base = buildPublicSlug(publicTitle, questionId);
  if (existing === base) return base;

  let candidate = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db
      .prepare(`SELECT id FROM questions WHERE public_slug = ?1 AND id <> ?2`)
      .bind(candidate, questionId)
      .first<{ id: number }>();
    if (!row) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }
  return `${base}-${questionId}`;
}

/**
 * Seed the first administrator from the environment.
 *
 * Runs only while the users table is empty, so it cannot be used to create
 * extra accounts later, and it verifies the supplied credentials against the
 * environment before writing anything.
 */
async function bootstrapIfEmpty(
  env: { DB: D1Database; ADMIN_BOOTSTRAP_EMAIL?: string; ADMIN_BOOTSTRAP_PASSWORD?: string },
  email: string,
  password: string,
  now: number,
): Promise<void> {
  const bootEmail = (env.ADMIN_BOOTSTRAP_EMAIL ?? "").trim().toLowerCase();
  const bootPassword = env.ADMIN_BOOTSTRAP_PASSWORD ?? "";
  if (!bootEmail || !bootPassword) return;

  const count = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first<{ c: number }>();
  if ((count?.c ?? 0) > 0) return;

  if (email !== bootEmail || password !== bootPassword) return;
  if (bootPassword.length < 12) {
    logger.error("bootstrap_password_too_weak");
    return;
  }

  const created = await createUser(env.DB, {
    email: bootEmail,
    name: "Lead Counselor",
    password: bootPassword,
    role: "admin",
    now,
  });
  logger.info("bootstrap_admin_created", { email: created.email });
}

/** Convenience re-export so the cron can email the whole team. */
export { listCounselorEmails, toPublicUser };
