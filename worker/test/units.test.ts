import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyPassword } from "../src/lib/password";
import { buildPublicSlug, generateTrackingToken, sha256Hex, timingSafeEqual } from "../src/lib/tokens";
import { buildFtsMatch } from "../src/db/archive";
import { consumeRateLimit, RULES } from "../src/lib/ratelimit";
import { resolveJwtSecret } from "../src/lib/session";
import { detectCrisis, excerpt, slugify, categorySlug, categoryFromSlug } from "../../shared/site";
import { request, uniqueIp } from "./helpers";

/** Unit-level coverage for the pieces that are easy to get subtly wrong. */

describe("password hashing", () => {
  it("round-trips a password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("correct horse battery stapler", stored)).toBe(false);
  });

  it("produces a different hash each time (unique salt)", async () => {
    const a = await hashPassword("the same password");
    const b = await hashPassword("the same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("the same password", b)).toBe(true);
  });

  it("rejects a malformed stored hash without throwing", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "pbkdf2-sha256$abc$!!$##")).toBe(false);
  });

  it("flags a hash whose iteration count is outdated", async () => {
    const current = await hashPassword("some password value");
    expect(needsRehash(current)).toBe(false);
    expect(needsRehash("pbkdf2-sha256$100000$AAAA$BBBB")).toBe(true);
    expect(needsRehash("garbage")).toBe(true);
  });
});

describe("identifiers and slugs", () => {
  it("generates tracking tokens with enough entropy to be unguessable", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 500; i++) tokens.add(generateTrackingToken());
    expect(tokens.size).toBe(500);
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(30);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("builds readable, stable, unique slugs", () => {
    expect(buildPublicSlug("What does grace mean in the Bible?", 1)).toBe(
      "what-does-grace-mean-in-the-bible-1",
    );
    // Punctuation, diacritics and apostrophes are handled rather than mangled.
    expect(slugify("Faith, Hope & Love — a counselor’s answer")).toBe("faith-hope-love-a-counselors-answer");
    expect(slugify("   ")).toBe("");
    // The numeric suffix keeps two identical titles distinct.
    expect(buildPublicSlug("Same title", 4)).not.toBe(buildPublicSlug("Same title", 5));
  });

  it("maps categories to slugs and back", () => {
    expect(categorySlug("Bible Interpretation")).toBe("bible-interpretation");
    expect(categoryFromSlug("bible-interpretation")).toBe("Bible Interpretation");
    expect(categoryFromSlug("nonsense")).toBeNull();
  });

  it("hashes rather than stores the rate-limit identity", async () => {
    const hashed = await sha256Hex("203.0.113.5");
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain("203.0.113.5");
    expect(await sha256Hex("203.0.113.5")).toBe(hashed);
  });

  it("compares secrets in constant time", () => {
    expect(timingSafeEqual("same-value", "same-value")).toBe(true);
    expect(timingSafeEqual("same-value", "different!!")).toBe(false);
    expect(timingSafeEqual("short", "much-longer-value")).toBe(false);
  });
});

describe("FTS query construction", () => {
  it("neutralises FTS5 operators", () => {
    for (const input of ['a"b', "a~2", "*", "NEAR(a b)", "a OR b", "-a +b ^c", "a:b(c)"]) {
      const built = buildFtsMatch(input);
      // Only quoted word tokens survive, so no operator can reach the parser.
      if (built) expect(built).toMatch(/^("[\p{L}\p{N}]+"( AND "[\p{L}\p{N}]+")*)$/u);
    }
  });

  it("returns null for a query with no usable words", () => {
    expect(buildFtsMatch("")).toBeNull();
    expect(buildFtsMatch("   ")).toBeNull();
    expect(buildFtsMatch("!!! ??? ---")).toBeNull();
  });

  it("caps the number of terms so a long query cannot be expensive", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const built = buildFtsMatch(long) ?? "";
    expect(built.split(" AND ")).toHaveLength(12);
  });
});

describe("rate limiting", () => {
  it("allows requests up to the limit and then refuses", async () => {
    const identity = `unit-${Math.random()}`;
    const rule = { name: "unit-test", limit: 3, windowSeconds: 60 };

    for (let i = 1; i <= 3; i++) {
      const result = await consumeRateLimit(env.CACHE, rule, identity);
      expect(result.allowed, `attempt ${i}`).toBe(true);
      expect(result.remaining).toBe(3 - i);
    }
    const fourth = await consumeRateLimit(env.CACHE, rule, identity);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps identities separate", async () => {
    const rule = { name: "unit-separate", limit: 1, windowSeconds: 60 };
    const a = await consumeRateLimit(env.CACHE, rule, "identity-a");
    expect(a.allowed).toBe(true);
    await consumeRateLimit(env.CACHE, rule, "identity-a");
    const b = await consumeRateLimit(env.CACHE, rule, "identity-b");
    expect(b.allowed).toBe(true);
  });

  it("fails open when the KV binding is unavailable", async () => {
    const result = await consumeRateLimit(undefined, RULES.login, "whatever");
    expect(result.allowed).toBe(true);
  });

  it("enforces the limit end to end on a public endpoint", async () => {
    const ip = uniqueIp();
    // The prayer-submission rule allows 6 per hour per IP.
    for (let i = 0; i < 6; i++) {
      const ok = await request("/api/prayer", {
        method: "POST",
        ip,
        body: { title: "A short request", content: "Please pray with me about this today." },
      });
      expect(ok.status, `request ${i}`).toBe(201);
    }
    const blocked = await request("/api/prayer", {
      method: "POST",
      ip,
      body: { title: "A short request", content: "Please pray with me about this today." },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.response.headers.get("retry-after")).toBeTruthy();
  });
});

describe("session secret validation", () => {
  it("refuses to run production with a weak secret", () => {
    expect(() => resolveJwtSecret("", "production")).toThrow();
    expect(() => resolveJwtSecret("short", "production")).toThrow();
    expect(() => resolveJwtSecret("change_me_to_a_long_random_string", "production")).toThrow();
  });

  it("accepts a strong secret", () => {
    const { secret, warned } = resolveJwtSecret("a".repeat(48), "production");
    expect(secret).toBe("a".repeat(48));
    expect(warned).toBe(false);
  });

  it("falls back to a volatile key outside production, and says so", () => {
    const { secret, warned } = resolveJwtSecret("", "development");
    expect(warned).toBe(true);
    expect(secret.length).toBeGreaterThan(32);
    // Volatile means a second call yields a different key.
    expect(resolveJwtSecret("", "development").secret).not.toBe(secret);
  });
});

describe("crisis detection", () => {
  it("detects explicit crisis language", () => {
    expect(detectCrisis("I am feeling suicidal").isCrisis).toBe(true);
    expect(detectCrisis("I want to end my life").isCrisis).toBe(true);
    expect(detectCrisis("there is domestic violence at home").isCrisis).toBe(true);
    expect(detectCrisis("I have been cutting myself").isCrisis).toBe(true);
  });

  it("handles hyphenation and spacing variants", () => {
    expect(detectCrisis("struggling with self-harm").isCrisis).toBe(true);
    expect(detectCrisis("struggling with self harm").isCrisis).toBe(true);
    expect(detectCrisis("struggling with selfharm").isCrisis).toBe(true);
  });

  it("does not fire on ordinary theological language", () => {
    expect(detectCrisis("What does it mean to die to self?").isCrisis).toBe(false);
    expect(detectCrisis("How should I pray when I feel anxious?").isCrisis).toBe(false);
    expect(detectCrisis("Explain the abuses of power in Judges.").isCrisis).toBe(false);
  });

  it("returns which terms matched, for triage context", () => {
    const result = detectCrisis("I feel suicidal and there is abuse in my home");
    expect(result.hits).toContain("suicidal");
    expect(result.hits.length).toBeGreaterThanOrEqual(2);
  });
});

describe("excerpt helper", () => {
  it("collapses whitespace and cuts on a word boundary", () => {
    const text = "First line.\n\n   Second line with     extra   spacing that goes on for a while.";
    const result = excerpt(text, 40);
    expect(result).not.toContain("\n");
    expect(result.length).toBeLessThanOrEqual(41);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toMatch(/\s…$/);
  });

  it("leaves short text alone", () => {
    expect(excerpt("Short and sweet.", 160)).toBe("Short and sweet.");
    expect(excerpt(null, 160)).toBe("");
    expect(excerpt(undefined, 160)).toBe("");
  });
});
