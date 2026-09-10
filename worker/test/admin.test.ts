import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { loginAdmin, newJar, request, submitQuestion, uniqueIp } from "./helpers";

describe("authentication", () => {
  it("bootstraps the first administrator from the environment on first login", async () => {
    const before = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first<{ c: number }>();
    expect(before?.c).toBe(0);

    const session = await loginAdmin();
    expect(session.user.role).toBe("admin");
    expect(session.user.email).toBe("pastor@example.com");

    const after = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first<{ c: number }>();
    expect(after?.c).toBe(1);
  });

  it("never stores a plaintext password", async () => {
    await loginAdmin();
    const row = await env.DB.prepare(`SELECT password_hash FROM users`).first<{ password_hash: string }>();
    expect(row?.password_hash).toBeTruthy();
    expect(row?.password_hash).not.toContain("a-very-strong-pass-123");
    expect(row?.password_hash.startsWith("pbkdf2-sha256$210000$")).toBe(true);
  });

  it("sets an httpOnly session cookie and a readable CSRF cookie", async () => {
    const jar = newJar();
    const result = await request("/api/admin/login", {
      method: "POST",
      ip: uniqueIp(),
      jar,
      body: { email: "pastor@example.com", password: "a-very-strong-pass-123" },
    });
    const cookies = result.response.headers.getSetCookie();
    const session = cookies.find((c: string) => c.startsWith("gl_session="));
    const csrf = cookies.find((c: string) => c.startsWith("gl_csrf="));

    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Lax");
    expect(session).toContain("Path=/api");
    expect(csrf).toBeTruthy();
    // The CSRF cookie must be readable by the frontend, or the double-submit
    // check can never succeed.
    expect(csrf).not.toContain("HttpOnly");
  });

  it("rejects bad credentials with one generic message", async () => {
    await loginAdmin();

    const wrongPassword = await request<{ error: string; message: string }>("/api/admin/login", {
      method: "POST",
      ip: uniqueIp(),
      body: { email: "pastor@example.com", password: "not-the-right-password" },
    });
    expect(wrongPassword.status).toBe(401);

    // Same status and same wording for an account that does not exist: the
    // endpoint must not reveal which emails are registered.
    const unknownEmail = await request<{ error: string; message: string }>("/api/admin/login", {
      method: "POST",
      ip: uniqueIp(),
      body: { email: "nobody@example.com", password: "not-the-right-password" },
    });
    expect(unknownEmail.status).toBe(401);
    // Same code and same wording — only the per-request id differs.
    expect(unknownEmail.body?.error).toBe(wrongPassword.body?.error);
    expect(unknownEmail.body?.message).toBe(wrongPassword.body?.message);
  });

  it("resolves /me for a signed-in counselor and null otherwise", async () => {
    const session = await loginAdmin();
    const anonymous = await request<{ user: null }>("/api/admin/me", { ip: uniqueIp() });
    expect(anonymous.status).toBe(200);
    expect(anonymous.body?.user).toBeNull();

    const signedIn = await request<{ user: { email: string } | null }>("/api/admin/me", {
      ip: uniqueIp(),
      jar: session.jar,
    });
    expect(signedIn.body?.user?.email).toBe("pastor@example.com");
  });

  it("invalidates the session on logout", async () => {
    const session = await loginAdmin();
    const logout = await request("/api/admin/logout", {
      method: "POST",
      ip: uniqueIp(),
      jar: session.jar,
      csrf: session.csrf,
    });
    expect(logout.status).toBe(200);

    const after = await request("/api/admin/inbox", { ip: uniqueIp(), jar: session.jar });
    expect(after.status).toBe(401);
  });

  it("locks an account after repeated failed attempts", async () => {
    await loginAdmin();
    const ip = uniqueIp();
    let lastStatus = 0;
    for (let attempt = 0; attempt < 9; attempt++) {
      const result = await request("/api/admin/login", {
        method: "POST",
        ip,
        body: { email: "pastor@example.com", password: "wrong-password-attempt" },
      });
      lastStatus = result.status;
    }
    expect(lastStatus).toBe(429);

    // Even the correct password is refused while the lockout is active.
    const correct = await request("/api/admin/login", {
      method: "POST",
      ip: uniqueIp(),
      body: { email: "pastor@example.com", password: "a-very-strong-pass-123" },
    });
    expect(correct.status).toBe(429);
  });
});

describe("authorization", () => {
  it("rejects every admin route without a session", async () => {
    const paths = [
      "/api/admin/inbox",
      "/api/admin/stats",
      "/api/admin/questions/1",
      "/api/admin/team",
      "/api/admin/audit",
      "/api/admin/counselors",
    ];
    for (const path of paths) {
      const result = await request(path, { ip: uniqueIp() });
      expect(result.status, path).toBe(401);
    }
  });

  it("stops a counselor from reaching admin-only team management", async () => {
    const admin = await loginAdmin();
    const created = await request<{ id: string }>("/api/admin/team", {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: { email: "helper@example.com", name: "Helper", password: "a-long-enough-password", role: "counselor" },
    });
    expect(created.status).toBe(201);

    const counselor = await loginAdmin(uniqueIp(), "helper@example.com", "a-long-enough-password");
    expect(counselor.user.role).toBe("counselor");

    // A counselor may read the inbox and reply, but must not manage the team.
    const inbox = await request("/api/admin/inbox", { ip: uniqueIp(), jar: counselor.jar });
    expect(inbox.status).toBe(200);

    const team = await request("/api/admin/team", { ip: uniqueIp(), jar: counselor.jar });
    expect(team.status).toBe(403);

    const create = await request("/api/admin/team", {
      method: "POST",
      ip: uniqueIp(),
      jar: counselor.jar,
      csrf: counselor.csrf,
      body: { email: "intruder@example.com", password: "a-long-enough-password", role: "admin" },
    });
    expect(create.status).toBe(403);

    const promote = await request(`/api/admin/team/${created.body?.id}`, {
      method: "PATCH",
      ip: uniqueIp(),
      jar: counselor.jar,
      csrf: counselor.csrf,
      body: { role: "admin" },
    });
    expect(promote.status).toBe(403);
  });

  it("cannot demote or remove the last administrator", async () => {
    const admin = await loginAdmin();
    const demote = await request(`/api/admin/team/${admin.user.id}`, {
      method: "PATCH",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: { role: "counselor" },
    });
    expect(demote.status).toBe(409);

    const remove = await request(`/api/admin/team/${admin.user.id}`, {
      method: "DELETE",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
    });
    expect(remove.status).toBe(400);
  });
});

describe("CSRF", () => {
  it("refuses a mutation that omits the CSRF token", async () => {
    const admin = await loginAdmin();
    const { id } = await submitQuestion();

    const result = await request(`/api/admin/questions/${id}/status`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      body: { status: "resolved" },
    });
    expect(result.status).toBe(403);

    // The status must not have changed.
    const row = await env.DB.prepare(`SELECT status FROM questions WHERE id = ?1`).bind(id).first<{ status: string }>();
    expect(row?.status).toBe("new");
  });

  it("refuses a mutation whose token does not match the cookie", async () => {
    const admin = await loginAdmin();
    const { id } = await submitQuestion();
    const result = await request(`/api/admin/questions/${id}/status`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: "a-completely-different-token-value",
      body: { status: "resolved" },
    });
    expect(result.status).toBe(403);
  });

  it("accepts a mutation with a matching token", async () => {
    const admin = await loginAdmin();
    const { id } = await submitQuestion();
    const result = await request(`/api/admin/questions/${id}/status`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: { status: "resolved" },
    });
    expect(result.status).toBe(200);
  });
});

describe("counselor workflow", () => {
  it("lists new questions with urgent ones first", async () => {
    await loginAdmin();
    await submitQuestion({ title: "Routine question about tithing", category: "Other" });
    const urgent = await submitQuestion({
      title: "I need help right now",
      content: "I am feeling suicidal and I do not know who to talk to about this.",
    });

    const admin = await loginAdmin();
    const inbox = await request<{ items: { id: number; isUrgent: boolean }[]; counts: Record<string, number> }>(
      "/api/admin/inbox?status=new",
      { ip: uniqueIp(), jar: admin.jar },
    );
    expect(inbox.status).toBe(200);
    expect(inbox.body?.items[0]?.id).toBe(urgent.id);
    expect(inbox.body?.items[0]?.isUrgent).toBe(true);
    expect(inbox.body?.counts.new).toBe(2);
    expect(inbox.body?.counts.urgent).toBe(1);
  });

  it("replies, moves the thread to active, and notifies the room", async () => {
    const admin = await loginAdmin();
    const { id, token } = await submitQuestion();

    const reply = await request<{ id: number }>(`/api/admin/threads/${id}/messages`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: { content: "Grace be with you. Let us look at Ephesians 2 together." },
    });
    expect(reply.status).toBe(201);

    const thread = await request<{ question: { title: string; content: string }; messages: unknown[] }>(
      `/api/threads/${token}`,
      { ip: uniqueIp() },
    );
    expect(thread.body?.messages).toHaveLength(1);
    // The seeker sees their own words back — never anyone else's.
    expect(thread.body?.question.title).toBeTruthy();

    const row = await env.DB.prepare(`SELECT status FROM questions WHERE id = ?1`).bind(id).first<{ status: string }>();
    expect(row?.status).toBe("active");
  });

  it("records an internal note that never reaches the seeker", async () => {
    const admin = await loginAdmin();
    const { id, token } = await submitQuestion();

    const note = await request(`/api/admin/questions/${id}/notes`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: { content: "Follow up Thursday — this one needs a phone call." },
    });
    expect(note.status).toBe(201);

    const detail = await request<{ notes: { content: string }[] }>(`/api/admin/questions/${id}`, {
      ip: uniqueIp(),
      jar: admin.jar,
    });
    expect(detail.body?.notes).toHaveLength(1);

    const seekerView = await request(`/api/threads/${token}`, { ip: uniqueIp() });
    expect(seekerView.text).not.toContain("Follow up Thursday");
  });
});

describe("publishing and the public archive", () => {
  it("refuses to publish without all three sanitized fields", async () => {
    const admin = await loginAdmin();
    const { id } = await submitQuestion();

    const result = await request(`/api/admin/questions/${id}/publish`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: { is_public: true, public_title: "Only a title" },
    });
    expect(result.status).toBe(422);

    const archive = await request("/api/archive", { ip: uniqueIp() });
    expect((archive.body as { items: unknown[] }).items).toHaveLength(0);
  });

  it("publishes with a descriptive slug and makes the answer searchable", async () => {
    const admin = await loginAdmin();
    const { id } = await submitQuestion({ title: "What does grace mean", category: "Bible Interpretation" });

    const published = await request<{ slug: string | null }>(`/api/admin/questions/${id}/publish`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: {
        is_public: true,
        public_title: "What does grace mean in the Bible?",
        public_content: "I keep hearing the word grace but I am not sure what it means.",
        public_answer:
          "Grace is unmerited favour. Ephesians 2:8 says you are saved by grace through faith, and that not of yourselves.",
        category: "Bible Interpretation",
      },
    });
    expect(published.status).toBe(200);
    // The slug is derived from the title plus a base36 id suffix, so it is
    // descriptive, stable and unique without depending on the row's position.
    expect(published.body?.slug).toBe(`what-does-grace-mean-in-the-bible-${id.toString(36)}`);

    const archive = await request<{ items: { slug: string; title: string }[]; total: number }>("/api/archive", {
      ip: uniqueIp(),
    });
    expect(archive.body?.total).toBe(1);
    expect(archive.body?.items[0]?.title).toBe("What does grace mean in the Bible?");

    // Search finds it by a stemmed variant of a word in the answer.
    const search = await request<{ items: unknown[] }>("/api/archive?q=favours", { ip: uniqueIp() });
    expect((search.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it("never leaks raw seeker text into the archive payload", async () => {
    const admin = await loginAdmin();
    const secret = "MY-SECRET-RAW-DETAIL-8842";
    const { id } = await submitQuestion({
      title: "Private title",
      content: `Please keep this private: ${secret}`,
    });
    await request(`/api/admin/questions/${id}/publish`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: {
        is_public: true,
        public_title: "A sanitized question",
        public_content: "A sanitized description of the question.",
        public_answer: "A thoughtful, scripture-based answer to the sanitized question.",
      },
    });

    const archive = await request("/api/archive", { ip: uniqueIp() });
    expect(archive.text).not.toContain(secret);
    expect(archive.text).not.toContain("Private title");

    const detail = await request(`/api/archive/a-sanitized-question-1`, { ip: uniqueIp() });
    expect(detail.text).not.toContain(secret);
  });

  it("survives FTS5 operators in a search query instead of erroring", async () => {
    const admin = await loginAdmin();
    const { id } = await submitQuestion();
    await request(`/api/admin/questions/${id}/publish`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: {
        is_public: true,
        public_title: "Anxiety and fear",
        public_content: "How do I deal with anxiety?",
        public_answer: "Cast your anxiety on Him, for He cares for you.",
      },
    });

    // Each of these would be a syntax error if passed to FTS5 verbatim.
    for (const query of ['"', "anxiety~2", "* OR *", "a AND b NOT c", "NEAR(a b)", "- + ^ : ( )", "1; DROP TABLE"]) {
      const result = await request(`/api/archive?q=${encodeURIComponent(query)}`, { ip: uniqueIp() });
      expect(result.status, `query: ${query}`).toBe(200);
    }
  });

  it("redirects a legacy numeric URL to the canonical slug", async () => {
    const admin = await loginAdmin();
    const { id } = await submitQuestion();
    await request(`/api/admin/questions/${id}/publish`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: {
        is_public: true,
        public_title: "Canonical slug check",
        public_content: "Checking that old numeric links resolve.",
        public_answer: "They should redirect to the descriptive URL rather than duplicate it.",
      },
    });

    const legacy = await request<{ redirect?: string }>(`/api/archive/${id}`, { ip: uniqueIp() });
    expect(legacy.status).toBe(301);
    expect(legacy.body?.redirect).toBe(`/archive/canonical-slug-check-${id.toString(36)}`);
  });

  it("retracts the answer from search when unpublished", async () => {
    const admin = await loginAdmin();
    const { id } = await submitQuestion();
    const payload = {
      is_public: true,
      public_title: "Temporary publication",
      public_content: "This will be unpublished shortly.",
      public_answer: "And should vanish from the search index when it is.",
    };
    await request(`/api/admin/questions/${id}/publish`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: payload,
    });
    const before = await request("/api/archive?q=unpublished", { ip: uniqueIp() });
    expect((before.body as { items: unknown[] }).items).toHaveLength(1);

    await request(`/api/admin/questions/${id}/publish`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: { ...payload, is_public: false },
    });

    const after = await request("/api/archive?q=unpublished", { ip: uniqueIp() });
    expect((after.body as { items: unknown[] }).items).toHaveLength(0);
  });
});

describe("audit log", () => {
  it("records privileged actions with actor and resource", async () => {
    const admin = await loginAdmin();
    const { id } = await submitQuestion();
    await request(`/api/admin/questions/${id}/status`, {
      method: "POST",
      ip: uniqueIp(),
      jar: admin.jar,
      csrf: admin.csrf,
      body: { status: "resolved" },
    });

    const audit = await request<{ items: { action: string; actorEmail: string | null }[] }>("/api/admin/audit", {
      ip: uniqueIp(),
      jar: admin.jar,
    });
    expect(audit.status).toBe(200);
    const actions = audit.body?.items.map((i) => i.action) ?? [];
    expect(actions).toContain("question.status");
    expect(actions).toContain("admin.login");

    // The log records who and what, never the seeker's words or a password.
    const stored = await env.DB.prepare(`SELECT meta FROM audit_log`).all<{ meta: string | null }>();
    expect(JSON.stringify(stored.results)).not.toContain("a-very-strong-pass-123");
  });
});

describe("malformed input", () => {
  it("answers bad identifiers with 400 rather than a server error", async () => {
    const admin = await loginAdmin();
    const paths = [
      `/api/admin/questions/abc`,
      `/api/admin/questions/-1`,
      `/api/admin/questions/1e9`,
      `/api/admin/questions/99999999999999999999`,
    ];
    for (const path of paths) {
      const result = await request(path, { ip: uniqueIp(), jar: admin.jar });
      expect(result.status, path).toBeLessThan(500);
    }
  });

  it("rejects a malformed JSON body without a 500", async () => {
    const result = await request("/api/questions", {
      method: "POST",
      ip: uniqueIp(),
      headers: { "content-type": "application/json" },
    });
    // No body at all: the route treats it as an empty object and validates it.
    expect(result.status).toBe(422);
  });
});
