// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { Resend } from "@convex-dev/resend";
import { api, internal } from "./_generated/api";
import { emailMode } from "./lib/emailConfig";
const modules = import.meta.glob("./**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AUTH_ISSUER", "http://127.0.0.1:3211");
  vi.stubEnv("EMAIL_DELIVERY_MODE", "development");
  vi.stubEnv("EMAIL_VERIFICATION_SECRET", "deterministic-test-secret");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  const { id, sessionId } = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      wallet: "GTEST",
      platformRole: "user",
      tokenIdentifier: "test|alice",
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId: id,
      tokenHash: "hash",
      network: "testnet",
      expiresAt: Date.now() + 86400000,
    });
    return { id, sessionId };
  });
  const alice = t.withIdentity({
    tokenIdentifier: "test|alice",
    subject: "alice",
    issuer: "test",
    sessionId,
  });
  return { t, alice, id };
}
async function request(
  s: Awaited<ReturnType<typeof setup>>,
  email = "Alice@Example.com",
) {
  await s.alice.action(api.emails.request, { email });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const status = await s.alice.query(api.emailData.status, {});
  expect(status.pending?.developmentCode).toMatch(/^\d{6}$/);
  return status.pending!.developmentCode!;
}
test("profile updates are owned and cannot change role or email", async () => {
  const { t, alice } = await setup();
  const profile = {
    name: "  Alice  ",
    bio: "Builder",
    links: { github: "https://github.com/alice" },
  };
  await expect(t.mutation(api.users.updateProfile, profile)).rejects.toThrow();
  await alice.mutation(api.users.updateProfile, profile);
  expect(await alice.query(api.users.me, {})).toMatchObject({
    name: "Alice",
    bio: "Builder",
    email: null,
    platformRole: "user",
  });
  await expect(
    alice.mutation(api.users.updateProfile, {
      ...profile,
      platformRole: "superadmin",
    } as typeof profile),
  ).rejects.toThrow();
  await expect(
    alice.mutation(api.users.updateProfile, {
      ...profile,
      links: { github: "https://github.com.evil.test/alice" },
    }),
  ).rejects.toThrow("INVALID_LINK");
  await expect(
    alice.mutation(api.users.updateProfile, { ...profile, name: "a" }),
  ).rejects.toThrow("INVALID_PROFILE");
});
test("email code is hashed, private, normalized and single use", async () => {
  const s = await setup();
  await expect(
    s.t.action(api.emails.request, { email: "a@example.com" }),
  ).rejects.toThrow();
  const code = await request(s);
  const p = await s.alice.query(internal.emailData.pending, {});
  expect(p?.email).toBe("alice@example.com");
  expect(p?.codeHash).toMatch(/^[a-f0-9]{64}$/);
  expect(p?.codeHash).not.toBe(code);
  await expect(s.t.query(api.emailData.status, {})).rejects.toThrow();
  expect(await s.alice.action(api.emails.verify, { code })).toBe("verified");
  expect(await s.alice.query(api.users.me, {})).toMatchObject({
    email: "alice@example.com",
    emailVerifiedAt: expect.any(Number),
  });
  expect(await s.alice.action(api.emails.verify, { code })).toBe("expired");
  expect((await s.alice.query(api.emailData.status, {})).pending).toBeNull();
});
test("five wrong attempts commit and lock even the correct code", async () => {
  const s = await setup();
  const code = await request(s);
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++)
    expect(await s.alice.action(api.emails.verify, { code: wrong })).toBe(
      i === 4 ? "locked" : "invalid",
    );
  expect(
    (await s.alice.query(api.emailData.status, {})).pending?.attempts,
  ).toBe(5);
  expect(await s.alice.action(api.emails.verify, { code })).toBe("locked");
});
test("requests enforce cooldown and hourly quota", async () => {
  const s = await setup();
  await request(s);
  await expect(
    s.alice.action(api.emails.request, { email: "a@example.com" }),
  ).rejects.toThrow("EMAIL_RATE_LIMITED");
  for (let i = 0; i < 2; i++) {
    vi.advanceTimersByTime(61000);
    await request(s);
  }
  vi.advanceTimersByTime(61000);
  await expect(
    s.alice.action(api.emails.request, { email: "a@example.com" }),
  ).rejects.toThrow("EMAIL_RATE_LIMITED");
});
test("expired and superseded codes cannot verify an email", async () => {
  const s = await setup();
  const old = await request(s);
  vi.advanceTimersByTime(61000);
  const fresh = await request(s, "other@example.com");
  const oldPending = await s.t.run((ctx) =>
    ctx.db
      .query("emailVerifications")
      .withIndex("by_user", (q) => q.eq("userId", s.id))
      .order("asc")
      .first(),
  );
  expect(
    await s.alice.mutation(internal.emailData.confirm, {
      id: oldPending!._id,
      codeHash: oldPending!.codeHash,
    }),
  ).toBe("expired");
  // Random collisions do not matter: server confirmation binds the record ID and nonce.
  if (old !== fresh)
    expect(await s.alice.action(api.emails.verify, { code: old })).toBe(
      "invalid",
    );
  vi.advanceTimersByTime(600001);
  expect(await s.alice.action(api.emails.verify, { code: fresh })).toBe(
    "expired",
  );
});
test("verified address stays intact while a replacement is pending", async () => {
  const s = await setup();
  const code = await request(s);
  await s.alice.action(api.emails.verify, { code });
  vi.advanceTimersByTime(61000);
  const next = await request(s, "new@example.com");
  expect((await s.alice.query(api.users.me, {})).email).toBe(
    "alice@example.com",
  );
  await s.alice.action(api.emails.verify, { code: next });
  expect((await s.alice.query(api.users.me, {})).email).toBe("new@example.com");
});
test("development mailbox is disabled outside localhost and never leaks stored codes", async () => {
  const s = await setup();
  await request(s);
  vi.stubEnv("AUTH_ISSUER", "https://hacks.mintedinpe.com");
  expect(emailMode()).toBe("unconfigured");
  expect(
    (await s.alice.query(api.emailData.status, {})).pending?.developmentCode,
  ).toBeNull();
  await expect(
    s.alice.action(api.emails.request, { email: "a@example.com" }),
  ).rejects.toThrow("EMAIL_NOT_CONFIGURED");
});
test("another user cannot read or consume a verification", async () => {
  const s = await setup();
  const code = await request(s);
  const p = await s.alice.query(internal.emailData.pending, {});
  const other = await s.t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      wallet: "GOTHER",
      tokenIdentifier: "test|bob",
      platformRole: "user",
    });
    return ctx.db.insert("authSessions", {
      userId: id,
      tokenHash: "other",
      network: "testnet",
      expiresAt: Date.now() + 86400000,
    });
  });
  const bob = s.t.withIdentity({
    tokenIdentifier: "test|bob",
    subject: "bob",
    issuer: "test",
    sessionId: other,
  });
  expect((await bob.query(api.emailData.status, {})).pending).toBeNull();
  expect(await bob.action(api.emails.verify, { code })).toBe("expired");
  expect(
    await bob.mutation(internal.emailData.confirm, {
      id: p!._id,
      codeHash: p!.codeHash,
    }),
  ).toBe("expired");
});

test("Resend delivery uses verified configuration and an idempotency key without exposing codes", async () => {
  const s = await setup();
  vi.stubEnv("EMAIL_DELIVERY_MODE", "resend");
  vi.stubEnv("RESEND_API_KEY", "fake-key-for-mocked-transport");
  vi.stubEnv("RESEND_FROM_EMAIL", "acceso@hacks.mintedinpe.com");
  vi.stubEnv("AUTH_ISSUER", "https://hacks.mintedinpe.com");
  const send = vi
    .spyOn(Resend.prototype, "sendEmail")
    .mockResolvedValue("mock-email" as never);
  await s.alice.action(api.emails.request, { email: "a@example.com" });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0][1]).toMatchObject({
    from: "acceso@hacks.mintedinpe.com",
    to: "a@example.com",
    idempotencyKey: expect.any(String),
    text: expect.stringMatching(/[0-9]{6}/),
  });
  const status = await s.alice.query(api.emailData.status, {});
  expect(status.mode).toBe("resend");
  expect(status.pending?.developmentCode).toBeNull();
  expect(status.pending?.delivery).toBe("queued");
});
test("failed mail enqueue is recorded so the client can retry", async () => {
  const s = await setup();
  vi.stubEnv("EMAIL_DELIVERY_MODE", "resend");
  vi.stubEnv("RESEND_API_KEY", "fake-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "acceso@hacks.mintedinpe.com");
  vi.spyOn(Resend.prototype, "sendEmail").mockRejectedValue(
    new Error("mock failure"),
  );
  await s.alice.action(api.emails.request, { email: "a@example.com" });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(
    (await s.alice.query(api.emailData.status, {})).pending?.delivery,
  ).toBe("failed");
});
test("cleanup preserves quota history but deletes records older than a day", async () => {
  const s = await setup();
  await request(s);
  vi.advanceTimersByTime(3600001);
  await s.t.mutation(internal.emailData.cleanup, {});
  expect(await s.alice.query(internal.emailData.pending, {})).not.toBeNull();
  vi.advanceTimersByTime(86400000);
  await s.t.mutation(internal.emailData.cleanup, {});
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("emailVerifications")
        .withIndex("by_user", (q) => q.eq("userId", s.id))
        .first(),
    ),
  ).toBeNull();
});
