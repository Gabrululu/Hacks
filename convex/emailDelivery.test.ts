// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, afterEach, test, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { Resend, type EmailEvent, type EmailId } from "@convex-dev/resend";
import resendTest from "@convex-dev/resend/test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
const webhookKey = Buffer.from("local-test-webhook-secret").toString("base64");
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AUTH_ISSUER", "http://127.0.0.1:3211");
  vi.stubEnv("EMAIL_DELIVERY_MODE", "resend");
  vi.stubEnv("RESEND_API_KEY", "mock-api-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "hacks <correo@hacks.mintedinpe.com>");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${webhookKey}`);
  vi.stubEnv("EMAIL_VERIFICATION_SECRET", "local-test-verification-secret");
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
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      wallet: "GTEST",
      name: "Alice",
      tokenIdentifier: "test|alice",
      platformRole: "organizer",
      email: "alice@example.com",
      emailVerifiedAt: Date.now(),
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      tokenHash: "test",
      network: "testnet",
      expiresAt: Date.now() + 86400000,
    });
    const verificationId = await ctx.db.insert("emailVerifications", {
      userId,
      email: "Alice@Example.com",
      codeHash: "test",
      expiresAt: Date.now() + 600000,
      attempts: 0,
      delivery: "queued",
    });
    return { userId, sessionId, verificationId };
  });
  const alice = t.withIdentity({
    issuer: "test",
    subject: "alice",
    tokenIdentifier: "test|alice",
    sessionId: ids.sessionId,
  });
  const send = vi
    .spyOn(Resend.prototype, "sendEmail")
    .mockResolvedValue("component-email" as EmailId);
  const enqueue = () =>
    t.mutation(internal.emailDelivery.enqueue, {
      source: { verificationId: ids.verificationId },
      verificationCode: "123456",
    });
  const event = async (
    type: EmailEvent["type"],
    bounceType = "Permanent",
    id = "component-email",
  ) => {
    const common = {
      created_at: new Date().toISOString(),
      email_id: "provider-id",
      from: "correo@hacks.mintedinpe.com",
      to: ["forged@example.com"],
      subject: "Test",
    };
    const data =
      type === "email.bounced"
        ? {
            ...common,
            bounce: {
              type: bounceType,
              subType: "General",
              message: "Test bounce",
            },
          }
        : type === "email.failed"
          ? { ...common, failed: { reason: "Test failure" } }
          : common;
    return t.mutation(internal.emailWebhook.onEvent, {
      id: id as EmailId,
      event: { type, created_at: new Date().toISOString(), data } as EmailEvent,
    });
  };
  const delivery = () =>
    t.run((ctx) =>
      ctx.db
        .query("emailDeliveries")
        .withIndex("by_sourceKey", (q) => q.eq("sourceKey", ids.verificationId))
        .unique(),
    );
  return { t, ...ids, alice, send, enqueue, event, delivery };
}
test("enqueue is atomic and idempotent and stores no plaintext verification code", async () => {
  const s = await setup();
  expect(await s.enqueue()).toBe("queued");
  expect(await s.enqueue()).toBe("queued");
  expect(s.send).toHaveBeenCalledOnce();
  expect(s.send.mock.calls[0][1]).toMatchObject({
    to: "alice@example.com",
    idempotencyKey: s.verificationId,
  });
  expect(JSON.stringify(await s.delivery())).not.toContain("123456");
});
test("delivery callbacks update the source without letting late events downgrade it", async () => {
  const s = await setup();
  await s.enqueue();
  await s.event("email.delivery_delayed");
  expect((await s.delivery())?.status).toBe("delivery_delayed");
  await s.event("email.delivered");
  await s.event("email.sent");
  await s.event("email.failed");
  expect((await s.delivery())?.status).toBe("delivered");
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.verificationId)))?.deliveryStatus,
  ).toBe("delivered");
});
test("hard bounces suppress the tracked recipient, ignore untrusted recipient data and deduplicate", async () => {
  const s = await setup();
  await s.enqueue();
  await s.event("email.bounced");
  await s.event("email.bounced");
  const suppressed = await s.t.run((ctx) =>
    ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", "alice@example.com"))
      .unique(),
  );
  expect(suppressed?.reason).toBe("hard_bounce");
  expect(
    await s.t.query(internal.emailDelivery.suppressed, {
      email: " ALICE@EXAMPLE.COM ",
    }),
  ).toBe(true);
  expect(
    await s.t.query(internal.emailDelivery.suppressed, {
      email: "forged@example.com",
    }),
  ).toBe(false);
  await expect(
    s.alice.action(api.emails.request, { email: "alice@example.com" }),
  ).rejects.toThrow("EMAIL_SUPPRESSED");
});
test("complaints permanently outrank bounce and delivery events", async () => {
  const s = await setup();
  await s.enqueue();
  await s.event("email.bounced");
  await s.event("email.complained");
  await s.event("email.delivered");
  await s.event("email.bounced");
  expect((await s.delivery())?.status).toBe("complained");
  expect(
    (
      await s.t.run((ctx) =>
        ctx.db
          .query("emailSuppressions")
          .withIndex("by_email", (q) => q.eq("email", "alice@example.com"))
          .unique(),
      )
    )?.reason,
  ).toBe("complaint");
});
test("temporary bounces do not globally suppress an address", async () => {
  const s = await setup();
  await s.enqueue();
  await s.event("email.bounced", "Transient");
  expect((await s.delivery())?.status).toBe("bounced");
  expect(
    await s.t.query(internal.emailDelivery.suppressed, {
      email: "alice@example.com",
    }),
  ).toBe(false);
});
test("unknown component ids and conflicting provider ids cannot alter delivery or suppression", async () => {
  const s = await setup();
  await s.enqueue();
  await s.event("email.bounced", "Permanent", "unknown");
  expect((await s.delivery())?.status).toBe("queued");
  await s.event("email.sent");
  await s.t.run(async (ctx) => {
    const row = (await ctx.db
      .query("emailDeliveries")
      .withIndex("by_sourceKey", (q) => q.eq("sourceKey", s.verificationId))
      .unique())!;
    await ctx.db.patch(row._id, { providerEmailId: "different-id" });
  });
  await s.event("email.complained");
  expect((await s.delivery())?.status).toBe("sent");
  expect(
    await s.t.query(internal.emailDelivery.suppressed, {
      email: "alice@example.com",
    }),
  ).toBe(false);
});
test("suppression arising between request and enqueue blocks transport, including development mailbox", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.insert("emailSuppressions", {
      email: "alice@example.com",
      reason: "complaint",
    }),
  );
  expect(await s.enqueue()).toBe("suppressed");
  expect(s.send).not.toHaveBeenCalled();
  vi.stubEnv("EMAIL_DELIVERY_MODE", "development");
  await expect(
    s.alice.action(api.emails.request, { email: "Alice@example.com" }),
  ).rejects.toThrow("EMAIL_SUPPRESSED");
});
test("registration messages use the same queue and suppression check", async () => {
  const s = await setup();
  const eventId = await s.alice.mutation(api.manage.create, {
    name: "Correo de prueba",
    slug: "correo-prueba",
    type: "hackathon",
    timezone: "UTC",
  });
  const id = await s.t.run(async (ctx) => {
    const registrationId = await ctx.db.insert("registrations", {
      eventId,
      userId: s.userId,
      status: "approved",
      formVersion: 1,
      answers: {},
      consentAt: Date.now(),
      emailOptOut: false,
    });
    return ctx.db.insert("registrationNotifications", {
      eventId,
      registrationId,
      userId: s.userId,
      revision: 1,
      status: "approved",
      subject: "Inscripción aprobada",
      body: "Hola",
      delivery: "queued",
    });
  });
  await s.t.run((ctx) =>
    ctx.db.insert("emailSuppressions", {
      email: "alice@example.com",
      reason: "hard_bounce",
    }),
  );
  await s.t.action(internal.registrationEmails.deliver, { id });
  expect(s.send).not.toHaveBeenCalled();
  expect((await s.t.run((ctx) => ctx.db.get(id)))?.deliveryStatus).toBe(
    "suppressed",
  );
  expect((await s.t.run((ctx) => ctx.db.get(id)))?.delivery).toBe("failed");
});
test("expired, replaced and suspended-user verification requests never enqueue", async () => {
  const s = await setup();
  await s.t.run((ctx) => ctx.db.patch(s.userId, { suspendedAt: Date.now() }));
  expect(await s.enqueue()).toBeNull();
  await s.t.run((ctx) => ctx.db.patch(s.userId, { suspendedAt: undefined }));
  vi.advanceTimersByTime(600001);
  expect(await s.enqueue()).toBeNull();
  expect(s.send).not.toHaveBeenCalled();
});
function signed(
  body: string,
  timestamp = Math.floor(Date.now() / 1000).toString(),
) {
  const id = "test-svix-id",
    signature = createHmac("sha256", Buffer.from(webhookKey, "base64"))
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
    "Content-Type": "application/json",
  };
}
test("webhook is unavailable without a secret and rejects unsigned or stale requests", async () => {
  const s = await setup();
  expect(
    (await s.t.fetch("/resend-webhook", { method: "POST", body: "{}" })).status,
  ).toBe(400);
  expect(
    (
      await s.t.fetch("/resend-webhook", {
        method: "POST",
        body: "{}",
        headers: signed("{}", String(Math.floor(Date.now() / 1000) - 600)),
      })
    ).status,
  ).toBe(400);
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
  expect(
    (await s.t.fetch("/resend-webhook", { method: "POST", body: "{}" })).status,
  ).toBe(503);
});
test("valid signed webhooks reach the official component; changed payloads are rejected", async () => {
  const s = await setup();
  resendTest.register(s.t);
  const body = JSON.stringify({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: {
      created_at: new Date().toISOString(),
      email_id: "unknown-provider-id",
      from: "correo@hacks.mintedinpe.com",
      to: ["alice@example.com"],
      subject: "Test",
    },
  });
  expect(
    (
      await s.t.fetch("/resend-webhook", {
        method: "POST",
        body,
        headers: signed(body),
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await s.t.fetch("/resend-webhook", {
        method: "POST",
        body: body.replace("delivered", "complained"),
        headers: signed(body),
      })
    ).status,
  ).toBe(400);
  expect(
    await s.t.query(internal.emailDelivery.suppressed, {
      email: "alice@example.com",
    }),
  ).toBe(false);
});
