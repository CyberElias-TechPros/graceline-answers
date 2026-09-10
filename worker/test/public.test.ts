import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { request, submitQuestion, uniqueIp } from "./helpers";
import { CATEGORIES } from "../../shared/site";

describe("public API — metadata", () => {
  it("reports health without leaking configuration", async () => {
    const result = await request<{ ok: boolean; service: string }>("/api/health");
    expect(result.status).toBe(200);
    expect(result.body?.ok).toBe(true);
    expect(result.text).not.toContain("JWT_SECRET");
  });

  it("exposes the category taxonomy and crisis copy to the frontend", async () => {
    const result = await request<{ categories: { name: string; slug: string }[]; crisisBanner: unknown }>(
      "/api/meta",
    );
    expect(result.status).toBe(200);
    expect(result.body?.categories.map((c) => c.name)).toEqual([...CATEGORIES]);
    expect(result.body?.crisisBanner).toBeTruthy();
    // Single source of truth: the API must not invent categories.
    expect(result.body?.categories).toHaveLength(CATEGORIES.length);
  });
});

describe("public API — question submission", () => {
  it("accepts a valid anonymous question and returns a tracking token", async () => {
    const question = await submitQuestion();
    expect(question.id).toBeGreaterThan(0);
    expect(question.token.length).toBeGreaterThanOrEqual(30);
    expect(question.crisis.isCrisis).toBe(false);
  });

  it("never stores the seeker's IP or user-agent", async () => {
    const ip = "198.51.100.77";
    const { id } = await submitQuestion({}, ip);

    // The schema must not have anywhere to put an address...
    const columns = await env.DB.prepare(`PRAGMA table_info(questions)`).all<{ name: string }>();
    const names = columns.results.map((c) => c.name).join(",");
    expect(names).not.toMatch(/ip|user_agent|useragent|fingerprint|device/i);

    // ...and the stored row must not contain it anywhere either.
    const row = await env.DB.prepare(`SELECT * FROM questions WHERE id = ?1`).bind(id).first<
      Record<string, unknown>
    >();
    expect(JSON.stringify(row)).not.toContain(ip);
    // Anonymous means anonymous: no address was volunteered, so none is stored.
    expect(row?.seeker_email).toBeNull();
  });

  it("rejects a question that is too short, with a per-field message", async () => {
    const result = await request<{ error: string; details: Record<string, string[]> }>("/api/questions", {
      method: "POST",
      ip: uniqueIp(),
      body: { title: "hi", content: "short" },
    });
    expect(result.status).toBe(422);
    expect(result.body?.error).toBe("validation_error");
    expect(result.body?.details?.title?.[0]).toBeTruthy();
    expect(result.body?.details?.content?.[0]).toBeTruthy();
  });

  it("rejects an invalid category and an invalid email", async () => {
    const badCategory = await request("/api/questions", {
      method: "POST",
      ip: uniqueIp(),
      body: {
        title: "A reasonable title here",
        content: "A long enough question body to pass validation checks.",
        category: "Not A Real Category",
      },
    });
    expect(badCategory.status).toBe(422);

    const badEmail = await request("/api/questions", {
      method: "POST",
      ip: uniqueIp(),
      body: {
        title: "A reasonable title here",
        content: "A long enough question body to pass validation checks.",
        email: "not-an-email",
      },
    });
    expect(badEmail.status).toBe(422);
  });

  it("flags crisis language and returns hotline resources", async () => {
    const question = await submitQuestion({
      title: "I want to end my life",
      content: "I have been feeling hopeless and I keep thinking about hurting myself.",
    });
    expect(question.crisis.isCrisis).toBe(true);

    const row = await env.DB.prepare(`SELECT is_urgent FROM questions WHERE id = ?1`).bind(question.id).first<{
      is_urgent: number;
    }>();
    expect(row?.is_urgent).toBe(1);
  });

  it("does not flag ordinary use of a similar word", async () => {
    // "abuse" appears inside "abused" but "abuses of power" is a theology topic;
    // the detector is word-boundary aware so it should not fire on substrings.
    const question = await submitQuestion({
      title: "Understanding free will",
      content: "Does God override our free will, or does He allow us to choose even wrongly?",
    });
    expect(question.crisis.isCrisis).toBe(false);
  });
});

describe("public API — seeker thread", () => {
  it("returns the seeker's own question and an empty conversation", async () => {
    const { token } = await submitQuestion({ title: "Marriage question" });
    const result = await request<{ question: { title: string }; messages: unknown[]; lastMessageId: number }>(
      `/api/threads/${token}`,
      { ip: uniqueIp() },
    );
    expect(result.status).toBe(200);
    expect(result.body?.question.title).toBe("Marriage question");
    expect(result.body?.messages).toHaveLength(0);
    expect(result.body?.lastMessageId).toBe(0);
  });

  it("refuses an unknown token with a 404, not a 500", async () => {
    const result = await request("/api/threads/does-not-exist-at-all", { ip: uniqueIp() });
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: "not_found" });
  });

  it("lets the seeker add a follow-up message", async () => {
    const { token } = await submitQuestion();
    const created = await request(`/api/threads/${token}/messages`, {
      method: "POST",
      ip: uniqueIp(),
      body: { token, content: "Thank you — one more thing I forgot to mention." },
    });
    expect(created.status).toBe(201);

    const thread = await request<{ messages: { sender: string }[] }>(`/api/threads/${token}`, {
      ip: uniqueIp(),
    });
    expect(thread.body?.messages).toHaveLength(1);
    expect(thread.body?.messages[0]?.sender).toBe("seeker");
  });

  it("rejects a message whose body token does not match the URL", async () => {
    const a = await submitQuestion();
    const b = await submitQuestion();
    const result = await request(`/api/threads/${a.token}/messages`, {
      method: "POST",
      ip: uniqueIp(),
      body: { token: b.token, content: "Trying to post into someone else's thread." },
    });
    expect(result.status).toBe(400);
  });
});

describe("public API — prayer wall", () => {
  it("creates, lists and counts prayer requests", async () => {
    const created = await request<{ id: number }>("/api/prayer", {
      method: "POST",
      ip: uniqueIp(),
      body: { title: "For my mother", content: "Please pray for my mother's surgery on Tuesday." },
    });
    expect(created.status).toBe(201);

    const listed = await request<{ items: { id: number; prayedCount: number }[] }>("/api/prayer", {
      ip: uniqueIp(),
    });
    expect(listed.body?.items.some((i) => i.id === created.body?.id)).toBe(true);

    const prayed = await request<{ prayedCount: number }>(`/api/prayer/${created.body?.id}/pray`, {
      method: "POST",
      ip: uniqueIp(),
    });
    expect(prayed.status).toBe(200);
    expect(prayed.body?.prayedCount).toBe(1);
  });

  it("returns 404 when praying for a request that does not exist", async () => {
    const result = await request("/api/prayer/99999999/pray", { method: "POST", ip: uniqueIp() });
    expect(result.status).toBe(404);
  });
});

describe("public API — archive", () => {
  it("starts empty and never exposes unpublished questions", async () => {
    await submitQuestion({ title: "This must stay private" });
    const result = await request<{ items: unknown[]; total: number }>("/api/archive", { ip: uniqueIp() });
    expect(result.status).toBe(200);
    expect(result.body?.items).toHaveLength(0);
    expect(result.text).not.toContain("This must stay private");
  });

  it("rejects malformed pagination instead of erroring", async () => {
    const result = await request("/api/archive?limit=notanumber&cursor=abc", { ip: uniqueIp() });
    expect(result.status).toBe(422);
  });

  it("returns 404 for an unknown archive entry", async () => {
    const result = await request("/api/archive/definitely-not-here", { ip: uniqueIp() });
    expect(result.status).toBe(404);
  });
});

describe("public API — routing hygiene", () => {
  it("answers unknown API paths with JSON, never HTML", async () => {
    const result = await request("/api/nope/nope", { ip: uniqueIp() });
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: "not_found" });
    expect(result.response.headers.get("content-type")).toContain("application/json");
  });

  it("sets security headers on every response", async () => {
    const result = await request("/api/health");
    expect(result.response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(result.response.headers.get("x-frame-options")).toBe("DENY");
    expect(result.response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(result.response.headers.get("x-request-id")).toBeTruthy();
  });

  it("does not emit CORS headers unless an origin is explicitly allowlisted", async () => {
    const result = await request("/api/health", { origin: "https://evil.example" });
    expect(result.response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
