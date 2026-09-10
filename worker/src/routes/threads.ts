import { Hono } from "hono";
import { CRISIS_BANNER, CATEGORIES, detectCrisis, THERAPY_DISCLAIMER } from "../../../shared/site";
import { enqueueEmail } from "../lib/email";
import { AppError } from "../lib/errors";
import { clientIp } from "../lib/http";
import { logger } from "../lib/logging";
import { RULES } from "../lib/ratelimit";
import { notifyThread, waitForActivity } from "../lib/realtime";
import { generateTrackingToken } from "../lib/tokens";
import { rateLimit } from "../middleware/ratelimit";
import {
  insertQuestion,
  findByToken,
  toSeekerView,
} from "../db/questions";
import { appendMessage, listMessages, maxMessageId, markSeekerRead } from "../db/conversation";
import {
  counselorMessageSchema,
  parse,
  parseIdParam,
  seekerMessageSchema,
  submitQuestionSchema,
} from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import { recordAudit } from "../db/audit";
import type { AppContext } from "../app";

/**
 * Seeker-facing routes.
 *
 * Authorization here is capability-based: possession of the 192-bit tracking
 * token *is* the credential. There is no account, no session, and no way to
 * enumerate tokens — which is what makes genuine anonymity possible.
 */
export function threadRoutes(): Hono<AppContext> {
  const app = new Hono<AppContext>();

  /** Submit a new question. */
  app.post("/questions", rateLimit(RULES.submitQuestion), async (c) => {
    const body = parse(submitQuestionSchema, await c.req.json().catch(() => ({})));
    const now = Date.now();
    const crisis = detectCrisis(`${body.title}\n${body.content}`);
    const trackingToken = generateTrackingToken();

    const id = await insertQuestion(c.env.DB, {
      trackingToken,
      seekerEmail: body.email ?? null,
      category: body.category ?? null,
      rawTitle: body.title,
      rawContent: body.content,
      isUrgent: crisis.isCrisis,
      now,
    });

    // Notify the counselor pool. `enqueueEmail` never throws — a queue problem
    // is logged and swallowed — so this cannot fail or meaningfully delay a
    // request from someone who just asked for help.
    const counselorEmails = await c.env.DB.prepare(
      `SELECT email FROM users WHERE is_active = 1 AND role IN ('admin','counselor')`,
    )
      .all<{ email: string }>()
      .then((r) => r.results.map((row) => row.email));

    if (counselorEmails.length > 0) {
      await enqueueEmail(c.env, {
        type: "counselor_new_question",
        to: counselorEmails,
        questionId: id,
        title: body.title,
        category: body.category ?? null,
        isUrgent: crisis.isCrisis,
        createdAt: now,
      });
    }

    logger.info("question_submitted", {
      request_id: c.get("requestId"),
      question_id: id,
      urgent: crisis.isCrisis,
      has_email: body.email !== null,
      category: body.category ?? null,
    });

    // camelCase, like every other public response. This endpoint used to return
    // snake_case (`tracking_token`), which was the only such response in the API
    // and silently broke the first client written against the documented shape.
    return c.json(
      {
        id,
        trackingToken,
        crisis: crisis.isCrisis ? { ...crisis, banner: CRISIS_BANNER } : { isCrisis: false, hits: [] },
        threadUrl: `/t/${trackingToken}`,
        disclaimer: THERAPY_DISCLAIMER,
      },
      201,
    );
  });

  /** The seeker's private thread. */
  app.get("/threads/:token", rateLimit(RULES.threadAccess), async (c) => {
    const token = c.req.param("token");
    const question = await findByToken(c.env.DB, token);
    if (!question) throw AppError.notFound("We could not find that conversation. Check the link and try again.");

    const messages = await listMessages(c.env.DB, question.id, 0);
    const now = Date.now();
    await markSeekerRead(c.env.DB, question.id, now);
    const crisis = detectCrisis(`${question.raw_title}\n${question.raw_content}`);

    return c.json({
      question: toSeekerView(question, messages.some((m) => m.sender_type === "counselor")),
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender_type,
        content: m.content,
        createdAt: m.created_at,
      })),
      lastMessageId: messages.length ? messages[messages.length - 1]!.id : 0,
      crisis: crisis.isCrisis ? { ...crisis, banner: CRISIS_BANNER } : { isCrisis: false, hits: [] },
      disclaimer: THERAPY_DISCLAIMER,
      now,
    });
  });

  /** Seeker follow-up message. */
  app.post("/threads/:token/messages", rateLimit(RULES.seekerMessage), async (c) => {
    const token = c.req.param("token");
    const body = parse(seekerMessageSchema, await c.req.json().catch(() => ({})));
    if (body.token !== token) throw AppError.badRequest("That request does not match the conversation.");

    const question = await findByToken(c.env.DB, token);
    if (!question) throw AppError.notFound("We could not find that conversation.");

    if (question.status === "resolved") {
      throw new AppError(
        "conflict",
        "This conversation was closed. Please start a new question and we will pick it up from there.",
      );
    }

    const now = Date.now();
    const messageId = await appendMessage(c.env.DB, {
      questionId: question.id,
      senderType: "seeker",
      senderUserId: null,
      content: body.content,
      now,
    });

    // Local Durable Object RPC: single-digit milliseconds, and awaiting it keeps
    // delivery deterministic. `notifyThread` already swallows its own errors, so
    // a room problem can never fail the seeker's message.
    await notifyThread(c.env, question.id, messageId);

    return c.json({ id: messageId, createdAt: now }, 201);
  });

  /**
   * Live stream. Holds the request open until a new message arrives (or the
   * timeout elapses), then returns anything newer than `since`.
   *
   * Clients that cannot hold a long request open fall back to
   * `GET /threads/:token/messages?since=`.
   */
  app.get("/threads/:token/stream", async (c) => {
    const token = c.req.param("token");
    const since = Number(c.req.query("since") ?? 0);
    if (!Number.isSafeInteger(since) || since < 0) throw AppError.badRequest("That cursor is not valid.");

    const question = await findByToken(c.env.DB, token);
    if (!question) throw AppError.notFound("We could not find that conversation.");

    const timeoutMs = Math.min(Math.max(Number(c.req.query("timeout") ?? 25_000), 1_000), 55_000);
    const watermark = await waitForActivity(c.env, question.id, since, timeoutMs);

    if (watermark <= since) {
      return c.json({ messages: [], watermark: since, heartbeat: true });
    }
    const messages = await listMessages(c.env.DB, question.id, since);
    return c.json({
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender_type,
        content: m.content,
        createdAt: m.created_at,
      })),
      watermark: messages.length ? messages[messages.length - 1]!.id : watermark,
      heartbeat: false,
    });
  });

  /** Polling fallback: returns anything newer than `since` immediately. */
  app.get("/threads/:token/messages", async (c) => {
    const token = c.req.param("token");
    const since = Number(c.req.query("since") ?? 0);
    if (!Number.isSafeInteger(since) || since < 0) throw AppError.badRequest("That cursor is not valid.");

    const question = await findByToken(c.env.DB, token);
    if (!question) throw AppError.notFound("We could not find that conversation.");

    const messages = await listMessages(c.env.DB, question.id, since);
    return c.json({
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender_type,
        content: m.content,
        createdAt: m.created_at,
      })),
      watermark: messages.length ? messages[messages.length - 1]!.id : since,
    });
  });

  /**
   * Counselor-side stream, so the console updates without polling too.
   * Authorization is the session cookie, checked before the id is even read.
   */
  app.get("/admin/threads/:id/stream", requireAuth, async (c) => {
    const questionId = parseIdParam(c.req.param("id"));
    const since = Number(c.req.query("since") ?? 0);
    if (!Number.isSafeInteger(since) || since < 0) throw AppError.badRequest("That cursor is not valid.");

    const exists = await c.env.DB.prepare(`SELECT id FROM questions WHERE id = ?1`).bind(questionId).first();
    if (!exists) throw AppError.notFound("That conversation does not exist.");

    const timeoutMs = Math.min(Math.max(Number(c.req.query("timeout") ?? 25_000), 1_000), 55_000);
    const watermark = await waitForActivity(c.env, questionId, since, timeoutMs);
    if (watermark <= since) return c.json({ messages: [], watermark: since, heartbeat: true });

    const messages = await listMessages(c.env.DB, questionId, since);
    return c.json({
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender_type,
        content: m.content,
        createdAt: m.created_at,
      })),
      watermark: messages.length ? messages[messages.length - 1]!.id : watermark,
      heartbeat: false,
    });
  });

  /** Counselor reply. */
  app.post(
    "/admin/threads/:id/messages",
    requireAuth,
    rateLimit(RULES.seekerMessage, { identityFor: (ctx) => String(ctx.get("user")?.id ?? clientIp(ctx.req.raw)) }),
    async (c) => {
      const questionId = parseIdParam(c.req.param("id"));
      const payload = await c.req.json().catch(() => ({}));
      const body = parse(counselorMessageSchema, { question_id: questionId, content: (payload as { content?: unknown }).content });

      const user = c.get("user");
      if (!user) throw AppError.unauthorized();

      const question = await c.env.DB.prepare(`SELECT * FROM questions WHERE id = ?1`).bind(questionId).first<{
        id: number;
        tracking_token: string;
        seeker_email: string | null;
        status: string;
        raw_title: string;
      }>();
      if (!question) throw AppError.notFound("That conversation does not exist.");

      const now = Date.now();
      const messageId = await appendMessage(c.env.DB, {
        questionId: question.id,
        senderType: "counselor",
        senderUserId: user.id,
        content: body.content,
        now,
      });

      // Notify the seeker by email only if they chose to leave an address.
      if (question.seeker_email) {
        await enqueueEmail(c.env, {
          type: "seeker_reply",
          to: question.seeker_email,
          questionId: question.id,
          trackingToken: question.tracking_token,
          preview: body.content,
          createdAt: now,
        });
      }

      await notifyThread(c.env, question.id, messageId);
      await recordAudit(c.env.DB, {
        actor: { id: user.id, email: user.email },
        action: "question.reply",
        resourceType: "question",
        resourceId: question.id,
        now,
      });

      return c.json({ id: messageId, createdAt: now }, 201);
    },
  );

  return app;
}

/** Current maximum message id for a thread — used by clients to seed a stream. */
export async function threadWatermark(db: D1Database, questionId: number): Promise<number> {
  return maxMessageId(db, questionId);
}
