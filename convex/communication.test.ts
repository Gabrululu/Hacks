// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, afterEach, test, expect, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { Resend, type EmailId } from "@convex-dev/resend";
import { render } from "@react-email/render";
import { createElement } from "react";
import { EventEmail } from "./emails/templates/EventEmail";
const modules = import.meta.glob("./**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AUTH_ISSUER", "http://127.0.0.1:3211");
  vi.stubEnv("EMAIL_DELIVERY_MODE", "development");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  async function person(
    name: string,
    role: "organizer" | "user" | "superadmin" = "user",
  ) {
    const ids = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        wallet: Keypair.random().publicKey(),
        name,
        email: `${name}@example.com`,
        emailVerifiedAt: Date.now(),
        platformRole: role,
        tokenIdentifier: `test|${name}`,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: id,
        tokenHash: name,
        network: "testnet",
        expiresAt: Date.now() + 180 * 86400000,
      });
      return { id, sessionId };
    });
    return {
      ...ids,
      client: t.withIdentity({
        issuer: "test",
        subject: name,
        tokenIdentifier: `test|${name}`,
        sessionId: ids.sessionId,
      }),
    };
  }
  const owner = await person("owner", "organizer"),
    alice = await person("alice"),
    bob = await person("bob"),
    outsider = await person("outsider"),
    comms = await person("comms"),
    admin = await person("admin", "superadmin");
  const eventId = await owner.client.mutation(api.manage.create, {
    name: "Comunicación Stellar",
    slug: "comunicacion",
    type: "hackathon",
    timezone: "UTC",
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(eventId, { status: "published" });
    await ctx.db.insert("eventStaff", {
      eventId,
      userId: comms.id,
      role: "comms",
    });
    for (const u of [alice, bob])
      await ctx.db.insert("registrations", {
        eventId,
        userId: u.id,
        status: u === alice ? "approved" : "pending",
        formVersion: 1,
        answers: { experience: "yes" },
        consentAt: Date.now(),
        emailOptOut: false,
      });
  });
  const draft = (
    kind:
      | "all"
      | "approved"
      | "pending"
      | "judges"
      | "mentors"
      | "filtered" = "all",
  ) =>
    owner.client.mutation(api.communication.save, {
      eventId,
      subject: "Hola {{name}} — {{eventName}}",
      bodyMarkdown: "Novedades para {{teamName}}.",
      audience: { kind },
    });
  const recipients = (
    id: import("./_generated/dataModel").Id<"emailCampaigns">,
  ) =>
    t.run((ctx) =>
      ctx.db
        .query("emailRecipients")
        .withIndex("by_event_campaign", (q) =>
          q.eq("eventId", eventId).eq("campaignId", id),
        )
        .take(100),
    );
  const snapshot = async (
    id: import("./_generated/dataModel").Id<"emailCampaigns">,
  ) => {
    await t.run((ctx) =>
      ctx.db.patch(id, {
        status: "preparing",
        frozenAt: Date.now(),
        recipientCount: 0,
      }),
    );
    await t.mutation(internal.communicationJobs.snapshot, {
      campaignId: id,
      cursor: null,
    });
    return recipients(id);
  };
  return {
    t,
    owner,
    alice,
    bob,
    outsider,
    comms,
    admin,
    eventId,
    draft,
    recipients,
    snapshot,
    person,
  };
}
test("campaign permission and event scope prevent impersonation and cross-event access", async () => {
  const s = await setup(),
    id = await s.draft();
  await expect(
    s.outsider.client.query(api.communication.campaigns, {
      eventId: s.eventId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.outsider.client.mutation(api.communication.send, {
      eventId: s.eventId,
      id,
    }),
  ).rejects.toThrow("FORBIDDEN");
  const other = await s.owner.client.mutation(api.manage.create, {
    name: "Otro",
    slug: "otro",
    type: "hackathon",
    timezone: "UTC",
  });
  await expect(
    s.owner.client.mutation(api.communication.save, {
      eventId: other,
      id,
      subject: "Hello",
      bodyMarkdown: "Hello",
      audience: { kind: "all" },
    }),
  ).rejects.toThrow("CAMPAIGN_UNAVAILABLE");
  await expect(
    s.comms.client.mutation(api.communication.save, {
      eventId: s.eventId,
      subject: "Privado",
      bodyMarkdown: "x",
      audience: { kind: "filtered", fieldId: "experience", equals: "yes" },
    }),
  ).rejects.toThrow("FORBIDDEN");
});
test("campaign variables and headers are validated and a frozen campaign cannot be edited", async () => {
  const s = await setup();
  await expect(
    s.owner.client.mutation(api.communication.save, {
      eventId: s.eventId,
      subject: "Bad\r\nBcc: bad",
      bodyMarkdown: "body",
      audience: { kind: "all" },
    }),
  ).rejects.toThrow("INVALID_MESSAGE");
  await expect(
    s.owner.client.mutation(api.communication.save, {
      eventId: s.eventId,
      subject: "{{secret}}",
      bodyMarkdown: "body",
      audience: { kind: "all" },
    }),
  ).rejects.toThrow("UNKNOWN_VARIABLE");
  const id = await s.draft();
  await s.snapshot(id);
  await expect(
    s.owner.client.mutation(api.communication.save, {
      eventId: s.eventId,
      id,
      subject: "changed",
      bodyMarkdown: "changed",
      audience: { kind: "all" },
    }),
  ).rejects.toThrow("CAMPAIGN_FROZEN");
});
test("audience snapshots approved participants once and ignore later registrants", async () => {
  const s = await setup(),
    id = await s.draft("approved");
  const rows = await s.snapshot(id);
  expect(rows.map((r) => r.userId)).toEqual([s.alice.id]);
  await s.t.mutation(internal.communicationJobs.snapshot, {
    campaignId: id,
    cursor: null,
  });
  expect(await s.recipients(id)).toHaveLength(1);
  await s.t.run((ctx) => ctx.db.patch(rows[0]._id, { status: "queued" }));
  expect((await s.recipients(id))[0].email).toBe("alice@example.com");
});
test("announcement opt-out is checked at delivery, while transactional results ignore it", async () => {
  const s = await setup(),
    id = await s.draft("approved"),
    [r] = await s.snapshot(id);
  await s.alice.client.mutation(api.communication.setPreference, {
    eventId: s.eventId,
    optedOut: true,
  });
  await s.t.mutation(internal.communicationJobs.begin, { campaignId: id });
  expect(
    await s.t.mutation(internal.emailDelivery.enqueue, {
      source: { recipientId: r._id },
    }),
  ).toBeNull();
  expect((await s.recipients(id))[0].status).toBe("skipped");
  await s.t.run(async (ctx) => {
    await ctx.db.patch(id, { category: "transactional" });
    await ctx.db.patch(s.eventId, { resultsPublished: true });
    await ctx.db.patch(r._id, { status: "queued" });
  });
  expect(
    await s.t.mutation(internal.emailDelivery.enqueue, {
      source: { recipientId: r._id },
    }),
  ).toBe("development");
});
test("global suppressions apply to campaigns and do not consume the event quota", async () => {
  const s = await setup(),
    id = await s.draft("approved"),
    [r] = await s.snapshot(id);
  await s.t.mutation(internal.communicationJobs.begin, { campaignId: id });
  await s.t.run((ctx) =>
    ctx.db.insert("emailSuppressions", { email: r.email, reason: "complaint" }),
  );
  expect(
    await s.t.mutation(internal.emailDelivery.enqueue, {
      source: { recipientId: r._id },
    }),
  ).toBe("suppressed");
  expect(
    (
      await s.owner.client.query(api.communication.quota, {
        eventId: s.eventId,
        now: Date.now(),
      })
    ).remaining,
  ).toBe(1000);
});
test("changed verified emails are skipped instead of sending to a stale snapshot", async () => {
  const s = await setup(),
    id = await s.draft("approved"),
    [r] = await s.snapshot(id);
  await s.t.mutation(internal.communicationJobs.begin, { campaignId: id });
  await s.t.run((ctx) =>
    ctx.db.patch(s.alice.id, { email: "new@example.com" }),
  );
  expect(
    await s.t.mutation(internal.emailDelivery.enqueue, {
      source: { recipientId: r._id },
    }),
  ).toBeNull();
  expect((await s.recipients(id))[0].status).toBe("skipped");
});
test("calendar monthly quota is atomic, idempotent, superadmin-only and resets next month", async () => {
  const s = await setup(),
    id = await s.draft(),
    rows = await s.snapshot(id);
  await s.t.mutation(internal.communicationJobs.begin, { campaignId: id });
  await expect(
    s.owner.client.mutation(api.communication.setQuota, {
      eventId: s.eventId,
      limit: 1,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.admin.client.mutation(api.communication.setQuota, {
    eventId: s.eventId,
    limit: 1,
  });
  expect(
    await s.t.mutation(internal.emailDelivery.enqueue, {
      source: { recipientId: rows[0]._id },
    }),
  ).toBe("development");
  expect(
    await s.t.mutation(internal.emailDelivery.enqueue, {
      source: { recipientId: rows[0]._id },
    }),
  ).toBe("development");
  expect(
    await s.t.mutation(internal.emailDelivery.enqueue, {
      source: { recipientId: rows[1]._id },
    }),
  ).toBe("failed");
  expect(
    (await s.recipients(id)).find((r) => r._id === rows[1]._id)?.error,
  ).toBe("MONTHLY_QUOTA_EXCEEDED");
  const next = new Date();
  vi.setSystemTime(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1));
  expect(
    (
      await s.owner.client.query(api.communication.quota, {
        eventId: s.eventId,
        now: Date.now(),
      })
    ).remaining,
  ).toBe(1);
});
test("a revoked campaign author or a cancelled campaign cannot enqueue further mail", async () => {
  const s = await setup(),
    id = await s.comms.client.mutation(api.communication.save, {
      eventId: s.eventId,
      subject: "News",
      bodyMarkdown: "Content",
      audience: { kind: "all" },
    }),
    [r] = await s.snapshot(id);
  await s.t.mutation(internal.communicationJobs.begin, { campaignId: id });
  await s.t.run(async (ctx) => {
    const staff = await ctx.db
      .query("eventStaff")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", s.eventId).eq("userId", s.comms.id),
      )
      .unique();
    await ctx.db.patch(staff!._id, { revokedAt: Date.now() });
  });
  expect(
    await s.t.mutation(internal.emailDelivery.enqueue, {
      source: { recipientId: r._id },
    }),
  ).toBeNull();
  expect((await s.recipients(id))[0].status).toBe("cancelled");
});
test("private announcements are never exposed to anonymous visitors or unrelated users", async () => {
  const s = await setup();
  for (const audience of ["all", "participants", "approved", "judges"] as const)
    await s.owner.client.mutation(api.announcements.post, {
      eventId: s.eventId,
      title: audience,
      body: "Novedades",
      audience,
      pinned: audience === "all",
    });
  const publicAnnouncements = await s.t.query(api.announcements.list, {
    slug: "comunicacion",
  });
  expect(publicAnnouncements.map((n) => n.title)).toEqual(["all"]);
  expect(Object.keys(publicAnnouncements[0]).sort()).toEqual([
    "body",
    "id",
    "pinned",
    "title",
  ]);
  expect(
    (
      await s.outsider.client.query(api.announcements.list, {
        slug: "comunicacion",
      })
    ).map((n) => n.title),
  ).toEqual(["all"]);
  expect(
    (
      await s.alice.client.query(api.announcements.list, {
        slug: "comunicacion",
      })
    )
      .map((n) => n.title)
      .sort(),
  ).toEqual(["all", "approved", "participants"]);
  expect(
    (await s.bob.client.query(api.announcements.list, { slug: "comunicacion" }))
      .map((n) => n.title)
      .sort(),
  ).toEqual(["all", "participants"]);
  await expect(
    s.outsider.client.mutation(api.announcements.post, {
      eventId: s.eventId,
      title: "Hack",
      body: "Hack",
      audience: "all",
      pinned: false,
    }),
  ).rejects.toThrow("FORBIDDEN");
});
test("unsubscribe tokens apply only to their event, are idempotent and cannot opt out transactional mail", async () => {
  const s = await setup(),
    id = await s.draft("approved"),
    [r] = await s.snapshot(id),
    token = "a".repeat(64),
    hash = createHash("sha256").update(token).digest("hex");
  await s.t.run((ctx) => ctx.db.patch(r._id, { unsubscribeHash: hash }));
  await s.t.action(api.emailUnsubscribe.unsubscribe, { token });
  await s.t.action(api.emailUnsubscribe.unsubscribe, { token });
  expect(
    await s.alice.client.query(api.communication.preference, {
      eventId: s.eventId,
    }),
  ).toBe(true);
  expect(
    await s.bob.client.query(api.communication.preference, {
      eventId: s.eventId,
    }),
  ).toBe(false);
  await expect(
    s.t.action(api.emailUnsubscribe.unsubscribe, { token: "b".repeat(64) }),
  ).rejects.toThrow("INVALID_UNSUBSCRIBE");
  await s.alice.client.mutation(api.communication.setPreference, {
    eventId: s.eventId,
    optedOut: false,
  });
  expect(
    await s.alice.client.query(api.communication.preference, {
      eventId: s.eventId,
    }),
  ).toBe(false);
});
test("campaign webhook updates the recipient and permanent bounces suppress subsequent deliveries", async () => {
  const s = await setup(),
    id = await s.draft("approved"),
    [r] = await s.snapshot(id);
  await s.t.mutation(internal.communicationJobs.begin, { campaignId: id });
  vi.stubEnv("EMAIL_DELIVERY_MODE", "resend");
  vi.stubEnv("RESEND_API_KEY", "mock");
  vi.stubEnv("RESEND_FROM_EMAIL", "hacks <mail@example.com>");
  vi.stubEnv("EMAIL_VERIFICATION_SECRET", "mock");
  vi.spyOn(Resend.prototype, "sendEmail").mockResolvedValue(
    "campaign-email" as EmailId,
  );
  await s.t.mutation(internal.emailDelivery.enqueue, {
    source: { recipientId: r._id },
  });
  await s.t.mutation(internal.emailWebhook.onEvent, {
    id: "campaign-email" as EmailId,
    event: {
      type: "email.bounced",
      created_at: new Date().toISOString(),
      data: {
        created_at: new Date().toISOString(),
        email_id: "provider",
        from: "mail@example.com",
        to: ["forged@example.com"],
        subject: "x",
        bounce: { type: "Permanent", subType: "General", message: "gone" },
      },
    },
  });
  expect((await s.recipients(id))[0].status).toBe("bounced");
  expect(
    await s.t.query(internal.emailDelivery.suppressed, { email: r.email }),
  ).toBe(true);
});
test("React Email template escapes raw HTML and unsafe links and includes the event unsubscribe link", async () => {
  const html = await render(
    createElement(EventEmail, {
      subject: "<script>test</script>",
      body: "<img src=x onerror=alert(1)>\n\n[Bad](javascript:alert(1))\n\n[Good](https://example.com)",
      eventName: "Stellar",
      primary: "#a4ff60",
      logo: null,
      unsubscribeUrl: "https://hacks.mintedinpe.com/unsubscribe/test",
    }),
  );
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("onerror=");
  expect(html).not.toContain("javascript:");
  expect(html).toContain("https://example.com");
  expect(html).toContain("/unsubscribe/test");
});
test("durable workflow freezes, personalizes and delivers all recipients without duplicate retries", async () => {
  const s = await setup(),
    id = await s.draft();
  await s.owner.client.mutation(api.communication.send, {
    eventId: s.eventId,
    id,
  });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const rows = await s.recipients(id);
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.status)).toEqual(["development", "development"]);
  expect(
    (
      await s.owner.client.query(api.communication.campaigns, {
        eventId: s.eventId,
      })
    )[0].status,
  ).toBe("sent");
  await s.t.action(internal.communicationEmails.deliver, {
    source: { recipientId: rows[0]._id },
  });
  expect(
    (
      await s.owner.client.query(api.communication.quota, {
        eventId: s.eventId,
        now: Date.now(),
      })
    ).remaining,
  ).toBe(998);
}, 30000);
test("staff invitations enqueue a private branded transactional mail and revoked links are not sent", async () => {
  const s = await setup();
  const invite = await s.owner.client.action(api.staffActions.invite, {
    eventId: s.eventId,
    role: "mentor",
    email: "invited@example.com",
  });
  const mail = await s.t.run((ctx) =>
    ctx.db
      .query("eventMail")
      .withIndex("by_eventId", (q) => q.eq("eventId", s.eventId))
      .first(),
  );
  expect(mail?.body).toContain(`/invite/${invite.token}`);
  expect(mail?.email).toBe("invited@example.com");
  await s.t.action(internal.communicationEmails.deliver, {
    source: { mailId: mail!._id },
  });
  expect(
    await s.owner.client.query(api.communication.mailbox, {
      eventId: s.eventId,
    }),
  ).toEqual([]);
  const second = await s.owner.client.action(api.staffActions.invite, {
    eventId: s.eventId,
    role: "mentor",
    email: "another@example.com",
  });
  await s.t.run((ctx) => ctx.db.patch(second.id, { revokedAt: Date.now() }));
  const mails = await s.t.run((ctx) =>
    ctx.db
      .query("eventMail")
      .withIndex("by_eventId", (q) => q.eq("eventId", s.eventId))
      .take(10),
  );
  expect(
    await s.t.action(internal.communicationEmails.deliver, {
      source: { mailId: mails[1]._id },
    }),
  ).toBeNull();
});
test("the test email goes only to the verified sender, has a usable local unsubscribe link and hides other recipients from comms", async () => {
  const s = await setup(),
    id = await s.draft("all");
  const testId = await s.owner.client.mutation(api.communication.test, {
    eventId: s.eventId,
    id,
  });
  await s.t.action(internal.communicationEmails.deliver, {
    source: { recipientId: testId },
  });
  const mailbox = await s.owner.client.query(api.communication.mailbox, {
    eventId: s.eventId,
  });
  expect(mailbox[0].subject).toContain("[Prueba] Hola owner");
  expect(mailbox[0].body).toMatch(/\/unsubscribe\/[a-f0-9]{64}/);
  await s.snapshot(id);
  const listing = await s.comms.client.query(api.communication.recipients, {
    eventId: s.eventId,
    id,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(listing.page.filter((r) => !r.isTest).map((r) => r.email)).toEqual([
    "Correo verificado",
    "Correo verificado",
  ]);
  expect(
    listing.page.every((r) => !("userId" in r) && !("unsubscribeHash" in r)),
  ).toBe(true);
});
test("increasing the monthly quota preserves consumption and retries only unsent frozen recipients", async () => {
  const s = await setup(),
    id = await s.draft(),
    rows = await s.snapshot(id);
  await s.t.mutation(internal.communicationJobs.begin, { campaignId: id });
  await s.admin.client.mutation(api.communication.setQuota, {
    eventId: s.eventId,
    limit: 1,
  });
  await s.t.mutation(internal.emailDelivery.enqueue, {
    source: { recipientId: rows[0]._id },
  });
  await s.t.mutation(internal.emailDelivery.enqueue, {
    source: { recipientId: rows[1]._id },
  });
  await s.t.mutation(internal.communicationJobs.finish, {
    campaignId: id,
    failed: false,
  });
  await s.admin.client.mutation(api.communication.setQuota, {
    eventId: s.eventId,
    limit: 3,
  });
  expect(
    (
      await s.owner.client.query(api.communication.quota, {
        eventId: s.eventId,
        now: Date.now(),
      })
    ).remaining,
  ).toBe(2);
  await s.owner.client.mutation(api.communication.retry, {
    eventId: s.eventId,
    id,
  });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await s.recipients(id)).map((r) => r.status)).toEqual([
    "development",
    "development",
  ]);
  expect(
    (
      await s.owner.client.query(api.communication.quota, {
        eventId: s.eventId,
        now: Date.now(),
      })
    ).remaining,
  ).toBe(1);
}, 30000);
test("a failed preparation cannot retry a partially frozen audience", async () => {
  const s = await setup(),
    id = await s.draft();
  await s.t.run((ctx) =>
    ctx.db.patch(id, {
      status: "failed",
      frozenAt: Date.now(),
      audienceFrozen: false,
    }),
  );
  await expect(
    s.owner.client.mutation(api.communication.retry, {
      eventId: s.eventId,
      id,
    }),
  ).rejects.toThrow("CAMPAIGN_FROZEN");
});
