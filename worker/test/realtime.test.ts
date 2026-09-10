import { describe, expect, it } from "vitest";
import { loginAdmin, request, submitQuestion, uniqueIp } from "./helpers";

/**
 * Live conversation delivery via the ThreadRoom Durable Object.
 *
 * These tests assert the behaviour the DO exists to provide: a waiting client is
 * released the moment a message is written, instead of waiting for its next
 * polling tick.
 */
describe("live thread streaming", () => {
  it("returns immediately with a heartbeat when nothing is new", async () => {
    const { token } = await submitQuestion();
    const started = Date.now();
    const result = await request<{ messages: unknown[]; heartbeat: boolean }>(
      `/api/threads/${token}/stream?since=0&timeout=1500`,
      { ip: uniqueIp() },
    );
    const elapsed = Date.now() - started;

    expect(result.status).toBe(200);
    expect(result.body?.messages).toHaveLength(0);
    expect(result.body?.heartbeat).toBe(true);
    // It really did hold the request open rather than returning instantly.
    expect(elapsed).toBeGreaterThanOrEqual(1200);
  });

  it("releases a waiting seeker as soon as a counselor replies", async () => {
    const admin = await loginAdmin();
    const { id, token } = await submitQuestion();

    // Park the seeker's stream first, then reply. The stream should resolve from
    // the notification rather than from its timeout.
    const waiting = request<{ messages: { sender: string; content: string }[]; watermark: number }>(
      `/api/threads/${token}/stream?since=0&timeout=10000`,
      { ip: uniqueIp() },
    );
    await new Promise((resolve) => setTimeout(resolve, 250));

    const started = Date.now();
    const reply = await request(`/api/admin/threads/${id}/messages`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: { content: "Peace be with you — let us walk through this together." },
    });
    expect(reply.status).toBe(201);

    const streamed = await waiting;
    const elapsed = Date.now() - started;

    expect(streamed.body?.messages).toHaveLength(1);
    expect(streamed.body?.messages[0]?.sender).toBe("counselor");
    expect(streamed.body?.watermark).toBeGreaterThan(0);
    // Delivery is near-instant, nowhere near the 10s timeout.
    expect(elapsed).toBeLessThan(5000);
  });

  it("releases a waiting counselor as soon as the seeker writes", async () => {
    const admin = await loginAdmin();
    const { id, token } = await submitQuestion();

    const waiting = request<{ messages: { sender: string }[] }>(
      `/api/admin/threads/${id}/stream?since=0&timeout=10000`,
      { ip: uniqueIp(), jar: admin.jar },
    );
    await new Promise((resolve) => setTimeout(resolve, 250));

    const posted = await request(`/api/threads/${token}/messages`, {
      method: "POST",
      ip: uniqueIp(),
      body: { token, content: "Adding a detail I forgot to mention earlier." },
    });
    expect(posted.status).toBe(201);

    const streamed = await waiting;
    expect(streamed.body?.messages.map((m) => m.sender)).toEqual(["seeker"]);
  });

  it("returns everything newer than the cursor, and nothing at or before it", async () => {
    const { token } = await submitQuestion();
    const first = await request<{ id: number }>(`/api/threads/${token}/messages`, {
      method: "POST",
      ip: uniqueIp(),
      body: { token, content: "First follow-up message from the seeker." },
    });
    const firstId = first.body?.id ?? 0;

    await request(`/api/threads/${token}/messages`, {
      method: "POST",
      ip: uniqueIp(),
      body: { token, content: "Second follow-up message from the seeker." },
    });

    const afterFirst = await request<{ messages: { content: string }[] }>(
      `/api/threads/${token}/messages?since=${firstId}`,
      { ip: uniqueIp() },
    );
    expect(afterFirst.body?.messages).toHaveLength(1);
    expect(afterFirst.body?.messages[0]?.content).toContain("Second follow-up");

    const fromStart = await request<{ messages: unknown[] }>(`/api/threads/${token}/messages?since=0`, {
      ip: uniqueIp(),
    });
    expect(fromStart.body?.messages).toHaveLength(2);
  });

  it("refuses to stream an unknown or malformed cursor", async () => {
    const { token } = await submitQuestion();
    const bad = await request(`/api/threads/${token}/stream?since=-5&timeout=1000`, { ip: uniqueIp() });
    expect(bad.status).toBe(400);

    const unknown = await request("/api/threads/nope-not-real/stream?since=0&timeout=1000", { ip: uniqueIp() });
    expect(unknown.status).toBe(404);
  });

  it("requires a session to stream as a counselor", async () => {
    const { id } = await submitQuestion();
    const result = await request(`/api/admin/threads/${id}/stream?since=0&timeout=1000`, { ip: uniqueIp() });
    expect(result.status).toBe(401);
  });

  it("closes a resolved conversation to further seeker messages", async () => {
    const admin = await loginAdmin();
    const { id, token } = await submitQuestion();
    await request(`/api/admin/questions/${id}/status`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: { status: "resolved" },
    });

    const result = await request(`/api/threads/${token}/messages`, {
      method: "POST",
      ip: uniqueIp(),
      body: { token, content: "One more question after this was closed." },
    });
    expect(result.status).toBe(409);
  });
});
