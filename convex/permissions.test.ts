/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import schema from "./schema";
import { requireUser, can } from "./lib/permissions";
import {
  eventMutation,
  authedQuery,
  superAdminMutation,
} from "./lib/functions";
import { makeFunctionReference } from "convex/server";
import { api } from "./_generated/api";
const modules = {
  ...import.meta.glob("./**/*.ts"),
  "./testFixtures.ts": async () => ({ edit, admin, me }),
};
// These fixtures are excluded from deployment because this is a .test.ts file.
export const edit = eventMutation("event.edit")({
  args: {},
  handler: async () => null,
});
export const admin = superAdminMutation({
  args: {},
  handler: async () => null,
});
export const me = authedQuery({
  args: {},
  handler: async (ctx) => ctx.user.name ?? null,
});
const editRef = makeFunctionReference<"mutation">("testFixtures:edit");
const adminRef = makeFunctionReference<"mutation">("testFixtures:admin");
const meRef = makeFunctionReference<"query">("testFixtures:me");
async function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      wallet: "owner",
      name: "Owner",
      tokenIdentifier: "https://test|owner",
      platformRole: "organizer",
    });
    const strangerId = await ctx.db.insert("users", {
      wallet: "stranger",
      tokenIdentifier: "https://test|stranger",
      platformRole: "user",
    });
    const adminId = await ctx.db.insert("users", {
      wallet: "admin",
      tokenIdentifier: "https://test|admin",
      platformRole: "superadmin",
    });
    const eventId = await ctx.db.insert("events", {
      slug: "private",
      ownerId,
      type: "hackathon",
      status: "draft",
      name: "Private event",
      format: "online",
      timezone: "UTC",
      timeline: {
        registrationOpensAt: 0,
        registrationClosesAt: 1,
        startsAt: 2,
        submissionOpensAt: 3,
        submissionClosesAt: 4,
        judgingClosesAt: 5,
      },
      settings: {
        admission: "auto",
        teamSizeMin: 1,
        teamSizeMax: 5,
        requiredCheckpoints: 0,
        judgesPerSubmission: 3,
        publicGallery: false,
      },
      theme: {
        mode: "dark",
        colors: {
          primary: "#fff",
          secondary: "#aaa",
          accent: "#ddd",
          background: "#050505",
          surface: "#111",
          text: "#fff",
        },
        fonts: { heading: "Inter", body: "Inter" },
        radius: "sm",
      },
      blocks: [],
      judgingClosed: false,
      resultsPublished: false,
    });
    await ctx.db.insert("eventStaff", {
      eventId,
      userId: ownerId,
      role: "owner",
    });
    const ownerSessionId = await ctx.db.insert("authSessions", {
      userId: ownerId,
      tokenHash: "owner",
      network: "testnet",
      expiresAt: Date.now() + 60_000,
    });
    const strangerSessionId = await ctx.db.insert("authSessions", {
      userId: strangerId,
      tokenHash: "stranger",
      network: "testnet",
      expiresAt: Date.now() + 60_000,
    });
    const adminSessionId = await ctx.db.insert("authSessions", {
      userId: adminId,
      tokenHash: "admin",
      network: "testnet",
      expiresAt: Date.now() + 60_000,
    });
    return {
      ownerId,
      strangerId,
      adminId,
      eventId,
      ownerSessionId,
      strangerSessionId,
      adminSessionId,
    };
  });
  return {
    t,
    ...ids,
    owner: t.withIdentity({
      sessionId: ids.ownerSessionId,
      subject: "owner",
      issuer: "https://test",
      tokenIdentifier: "https://test|owner",
    }),
    stranger: t.withIdentity({
      sessionId: ids.strangerSessionId,
      subject: "stranger",
      issuer: "https://test",
      tokenIdentifier: "https://test|stranger",
    }),
    superadmin: t.withIdentity({
      sessionId: ids.adminSessionId,
      subject: "admin",
      issuer: "https://test",
      tokenIdentifier: "https://test|admin",
    }),
  };
}
test("public catalog hides drafts", async () => {
  const { t } = await setup();
  expect(await t.query(api.events.list, {})).toEqual([]);
});
test("authenticated wrapper rejects anonymous callers and resolves server identity", async () => {
  const { t, owner } = await setup();
  await expect(t.query(meRef, {})).rejects.toThrow("UNAUTHENTICATED");
  expect(await owner.query(meRef, {})).toBe("Owner");
});
test("event mutation rejects cross-event access and audits successful staff writes", async () => {
  const { t, stranger, owner, eventId } = await setup();
  await expect(stranger.mutation(editRef, { eventId })).rejects.toThrow(
    "FORBIDDEN",
  );
  await owner.mutation(editRef, { eventId });
  const logs = await t.run((ctx) => ctx.db.query("auditLog").collect());
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ eventId, action: "event.edit" });
});
test("revoked permission overrides owner package", async () => {
  const { t, owner, eventId } = await setup();
  await t.run(async (ctx) => {
    const staff = await ctx.db.query("eventStaff").first();
    await ctx.db.patch(staff!._id, { revokedPermissions: ["event.edit"] });
  });
  await expect(
    owner.query(async (ctx) =>
      can(ctx, await requireUser(ctx), eventId, "event.edit"),
    ),
  ).resolves.toBe(false);
});
test("superadmin wrapper rejects organizer and audits admin", async () => {
  const { t, owner, superadmin } = await setup();
  await expect(owner.mutation(adminRef, {})).rejects.toThrow("FORBIDDEN");
  await superadmin.mutation(adminRef, {});
  expect(await t.run((ctx) => ctx.db.query("auditLog").collect())).toHaveLength(
    1,
  );
});
test("suspended users cannot access authenticated operations", async () => {
  const { t, owner, ownerId } = await setup();
  await t.run((ctx) => ctx.db.patch(ownerId, { suspendedAt: Date.now() }));
  await expect(owner.query(meRef, {})).rejects.toThrow("FORBIDDEN");
});
