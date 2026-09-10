import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../src/index";
import { deliverEmail, renderEmail } from "../src/lib/email";
import { runDaily, runHourly } from "../src/cron/maintenance";
import { checkFtsIntegrity, rebuildFtsIndex } from "../src/db/archive";
import { submitQuestion, uniqueIp, request, loginAdmin } from "./helpers";
import type { EmailJob, Env } from "../src/types";

/**
 * Asynchronous email and scheduled maintenance.
 *
 * Email is deliberately never sent inline on a user-facing request, so the
 * interesting behaviour lives in the queue consumer and the cron. These tests
 * call those handlers directly, which asserts ack/retry decisions rather than
 * hoping a batch happened to drain.
 */

function fakeMessage(body: EmailJob, attempts = 1) {
  return {
    body,
    attempts,
    ack: vi.fn(),
    retry: vi.fn(),
    queue: "graceline-email",
    id: "msg-1",
    timestamp: new Date(),
  };
}

/** A MessageBatch is an object with a `messages` array, not the array itself. */
function fakeBatch(messages: ReturnType<typeof fakeMessage>[]) {
  return { messages, queue: "graceline-email", retryAll: vi.fn(), ackAll: vi.fn() };
}

const newQuestionJob = (to: string[] = ["pastor@example.com"]): EmailJob => ({
  type: "counselor_new_question",
  to,
  questionId: 1,
  title: "What does grace mean?",
  category: "Bible Interpretation",
  isUrgent: false,
  createdAt: Date.now(),
});

describe("queue consumer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("acknowledges a job that delivers successfully", async () => {
    const message = fakeMessage(newQuestionJob());
    await handler.queue(fakeBatch([message]) as unknown as MessageBatch<EmailJob>, env);
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("retries a transient provider failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream unavailable", { status: 503 })),
    );
    const failingEnv = { ...env, EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "test-key" } as Env;

    const message = fakeMessage(newQuestionJob());
    await handler.queue(fakeBatch([message]) as unknown as MessageBatch<EmailJob>, failingEnv);
    expect(message.retry).toHaveBeenCalledTimes(1);
    expect(message.ack).not.toHaveBeenCalled();
  });

  it("acknowledges a permanent 4xx so one bad address cannot block the queue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid api key", { status: 401 })),
    );
    const failingEnv = { ...env, EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "bad-key" } as Env;

    const message = fakeMessage(newQuestionJob());
    await handler.queue(fakeBatch([message]) as unknown as MessageBatch<EmailJob>, failingEnv);
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("posts to the configured provider with the rendered subject and body", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
        return new Response("{}", { status: 200 });
      }),
    );
    const providerEnv = {
      ...env,
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "test-key",
      EMAIL_FROM: "GraceLine <hello@graceline.test>",
    } as Env;

    await deliverEmail(providerEnv, newQuestionJob(["a@example.com", "b@example.com"]));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect(calls[0]?.body.to).toEqual(["a@example.com", "b@example.com"]);
    expect(String(calls[0]?.body.subject)).toContain("What does grace mean?");
    expect(String(calls[0]?.body.html)).toContain("GraceLine");
  });
});

describe("email rendering", () => {
  it("marks crisis submissions urgent in the subject line", async () => {
    const rendered = renderEmail("https://graceline.test", "GraceLine Answers", {
      type: "counselor_new_question",
      to: ["pastor@example.com"],
      questionId: 7,
      title: "I need help",
      category: null,
      isUrgent: true,
      createdAt: Date.now(),
    });
    expect(rendered?.subject.startsWith("URGENT")).toBe(true);
    expect(rendered?.text).toContain("crisis language detected");
  });

  it("includes the tracking link and a safety disclaimer in seeker replies", async () => {
    const rendered = renderEmail("https://graceline.test", "GraceLine Answers", {
      type: "seeker_reply",
      to: "seeker@example.com",
      questionId: 7,
      trackingToken: "abc123token",
      preview: "Grace be with you.",
      createdAt: Date.now(),
    });
    expect(rendered?.text).toContain("https://graceline.test/t/abc123token");
    expect(rendered?.text).toContain("not a substitute for licensed therapy");
  });

  it("escapes HTML in untrusted content", async () => {
    const rendered = renderEmail("https://graceline.test", "GraceLine Answers", {
      type: "counselor_new_question",
      to: ["pastor@example.com"],
      questionId: 7,
      title: '<script>alert("xss")</script>',
      category: null,
      isUrgent: false,
      createdAt: Date.now(),
    });
    expect(rendered?.html).not.toContain("<script>");
    expect(rendered?.html).toContain("&lt;script&gt;");
  });
});

describe("submission enqueues a counselor notification", () => {
  it("produces a queue message when a question arrives", async () => {
    await loginAdmin();

    const sent: EmailJob[] = [];
    const queueEnv = {
      ...env,
      EMAIL_QUEUE: { send: async (job: EmailJob) => void sent.push(job) },
    } as unknown as Env;

    // Submit through the real route but with the spied queue bound.
    const { createApp } = await import("../src/app");
    const app = createApp();
    const response = await app.fetch(
      new Request("https://api.graceline.test/api/questions", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": uniqueIp() },
        body: JSON.stringify({
          title: "A question that should notify the team",
          content: "I would like to understand what it means to walk by faith rather than sight.",
          category: "Faith Crisis",
        }),
      }),
      queueEnv,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(201);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe("counselor_new_question");
  });
});

describe("scheduled maintenance", () => {
  it("escalates questions that nobody has answered", async () => {
    await loginAdmin();
    const question = await submitQuestion({ title: "Waiting a long time for an answer" });

    // Backdate it past the escalation threshold.
    const stale = Date.now() - 6 * 60 * 60 * 1000;
    await env.DB.prepare(`UPDATE questions SET created_at = ?1 WHERE id = ?2`).bind(stale, question.id).run();

    const sent: EmailJob[] = [];
    const queueEnv = {
      ...env,
      EMAIL_QUEUE: { send: async (job: EmailJob) => void sent.push(job) },
    } as unknown as Env;

    await runHourly(queueEnv, Date.now());

    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe("urgent_escalation_digest");
    if (sent[0]?.type === "urgent_escalation_digest") {
      expect(sent[0].questionIds).toContain(question.id);
    }
  });

  it("does not escalate a question that has already been answered", async () => {
    const admin = await loginAdmin();
    const { id } = await submitQuestion({ title: "Already answered" });
    await request(`/api/admin/threads/${id}/messages`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: { content: "Here is a thoughtful reply to your question." },
    });
    const stale = Date.now() - 6 * 60 * 60 * 1000;
    await env.DB.prepare(`UPDATE questions SET created_at = ?1 WHERE id = ?2`).bind(stale, id).run();

    const sent: EmailJob[] = [];
    await runHourly(
      { ...env, EMAIL_QUEUE: { send: async (job: EmailJob) => void sent.push(job) } } as unknown as Env,
      Date.now(),
    );
    expect(sent).toHaveLength(0);
  });

  it("prunes the audit log past its retention window and keeps recent entries", async () => {
    await loginAdmin();
    const old = Date.now() - 400 * 24 * 60 * 60 * 1000;
    await env.DB
      .prepare(`INSERT INTO audit_log (actor_email, action, created_at) VALUES ('pastor@example.com', 'admin.login', ?1)`)
      .bind(old)
      .run();

    await runDaily({ ...env, AUDIT_RETENTION_DAYS: "365" } as Env, Date.now());

    const remaining = await env.DB.prepare(`SELECT created_at FROM audit_log`).all<{ created_at: number }>();
    expect(remaining.results.some((r) => r.created_at === old)).toBe(false);
    expect(remaining.results.length).toBeGreaterThan(0);
  });

  it("verifies and rebuilds the search index without losing published answers", async () => {
    const admin = await loginAdmin();
    const { id } = await submitQuestion({ title: "Index maintenance check" });
    await request(`/api/admin/questions/${id}/publish`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: {
        is_public: true,
        public_title: "Recoverable search index",
        public_content: "Simulating an index that has drifted from its source table.",
        public_answer: "The maintenance rebuild should put it right again.",
      },
    });

    const before = await request("/api/archive?q=drifted", { ip: uniqueIp() });
    expect((before.body as { items: unknown[] }).items).toHaveLength(1);

    // An external-content FTS table must never be modified with plain DML — the
    // supported way to resynchronise it is FTS5's own rebuild command, which is
    // exactly what the daily cron falls back to.
    expect(await checkFtsIntegrity(env.DB)).toBe(true);
    await runDaily(env as Env, Date.now());
    await rebuildFtsIndex(env.DB);

    const after = await request("/api/archive?q=drifted", { ip: uniqueIp() });
    expect((after.body as { items: unknown[] }).items).toHaveLength(1);
    expect(await checkFtsIntegrity(env.DB)).toBe(true);
  });
});
