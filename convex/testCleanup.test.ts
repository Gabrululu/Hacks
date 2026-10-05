// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { test, expect, vi, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import schema from "./schema";
import { create as createEvent } from "./model/events";
import { internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function fixture() {
  vi.useFakeTimers();
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211");
  vi.stubEnv("AUTH_ISSUER", "http://127.0.0.1:3211");
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      wallet: Keypair.random().publicKey(),
      name: "Comunidad de builders",
      email: "comunidad@example.com",
      platformRole: "organizer",
      emailVerifiedAt: Date.now(),
    });
    const realId = await ctx.db.insert("users", {
      wallet: Keypair.random().publicKey(),
      name: "Organizador real",
      platformRole: "organizer",
      emailVerifiedAt: Date.now(),
    });
    return { ownerId, realId };
  });
  const create = async (slug: string, ownerId = ids.ownerId) =>
    t.run(async (ctx) =>
      createEvent(ctx, (await ctx.db.get(ownerId))!, {
        name: "Prueba Buildathon Stellar",
        slug,
        type: "hackathon",
        timezone: "UTC",
      }),
    );
  return { t, ...ids, create };
}
test("cleanup refuses cloud deployments", async () => {
  const s = await fixture();
  vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
  await expect(s.t.query(internal.testCleanup.tables, {})).rejects.toThrow(
    "LOCAL_TEST_CLEANUP_ONLY",
  );
});
test("cleanup identifies exact fixtures and preserves real events even with similar names", async () => {
  const s = await fixture(),
    testId = await s.create("build-browser-1780000000000"),
    realId = await s.create("evento-test-real"),
    wrongOwner = await s.create("build-browser-1780000000001", s.realId);
  const inv = await s.t.query(internal.testCleanup.inventory, {
    paginationOpts: { cursor: null, numItems: 25 },
  });
  expect(inv.page.map((r) => r.id)).toEqual([testId]);
  await expect(
    s.t.mutation(internal.testCleanup.removeBatch, {
      eventId: realId,
      table: "events",
    }),
  ).rejects.toThrow("NOT_A_TEST_FIXTURE");
  await expect(
    s.t.mutation(internal.testCleanup.removeBatch, {
      eventId: wrongOwner,
      table: "events",
    }),
  ).rejects.toThrow("NOT_A_TEST_FIXTURE");
  expect(await s.t.run((ctx) => ctx.db.get(realId))).not.toBeNull();
});
test("cleanup requires children first, deletes stored files and is idempotent", async () => {
  const s = await fixture(),
    eventId = await s.create("build-browser-1780000000000"),
    fileId = await s.t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["temporary"]));
      await ctx.db.insert("eventAssets", {
        eventId,
        fileId: id,
        name: "fixture.txt",
        kind: "resource",
        createdBy: s.ownerId,
      });
      return id;
    });
  await expect(
    s.t.mutation(internal.testCleanup.removeBatch, {
      eventId,
      table: "events",
    }),
  ).rejects.toThrow("CLEAN_CHILDREN_FIRST");
  const tables = await s.t.query(internal.testCleanup.tables, {});
  for (const table of tables) {
    let more;
    do {
      more = (
        await s.t.mutation(internal.testCleanup.removeBatch, { eventId, table })
      ).more;
    } while (more);
  }
  await s.t.mutation(internal.testCleanup.removeBatch, {
    eventId,
    table: "events",
  });
  expect(await s.t.run((ctx) => ctx.storage.get(fileId))).toBeNull();
  expect(
    (
      await s.t.mutation(internal.testCleanup.removeBatch, {
        eventId,
        table: "events",
      })
    ).removed,
  ).toBe(0);
});
test("wallet cleanup only accepts fresh wallets and refuses the real superadmin", async () => {
  const s = await fixture();
  const owner = (await s.t.run((ctx) => ctx.db.get(s.ownerId)))!;
  await expect(
    s.t.mutation(internal.testCleanup.registerWallet, {
      wallet: owner.wallet,
      runId: "run",
    }),
  ).rejects.toThrow("NOT_A_NEW_TEST_WALLET");
  const wallet = Keypair.random().publicKey();
  await s.t.mutation(internal.testCleanup.registerWallet, {
    wallet,
    runId: "run",
  });
  await s.t.run((ctx) =>
    ctx.db.insert("users", { wallet, platformRole: "superadmin" }),
  );
  await expect(
    s.t.mutation(internal.testCleanup.removeWalletBatch, { runId: "run" }),
  ).rejects.toThrow("PRESERVE_SUPERADMIN");
});
test("disposable wallet cleanup deletes login records after failed tests", async () => {
  const s = await fixture(),
    wallet = Keypair.random().publicKey();
  await s.t.mutation(internal.testCleanup.registerWallet, {
    wallet,
    runId: "failed-test",
  });
  const id = await s.t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      wallet,
      platformRole: "user",
    });
    await ctx.db.insert("authSessions", {
      userId,
      tokenHash: "temporary",
      network: "testnet",
      expiresAt: Date.now() + 60000,
    });
    return userId;
  });
  let more;
  do {
    more = (
      await s.t.mutation(internal.testCleanup.removeWalletBatch, {
        runId: "failed-test",
      })
    ).more;
  } while (more);
  expect(await s.t.run((ctx) => ctx.db.get(id))).toBeNull();
  expect(
    (
      await s.t.query(internal.testCleanup.inventory, {
        paginationOpts: { cursor: null, numItems: 25 },
      })
    ).page,
  ).toEqual([]);
});
test("cleanup removes completed campaign workflows without trying to cancel them", async () => {
  const s = await fixture(),
    eventId = await s.create("build-browser-1780000000099");
  vi.stubEnv("EMAIL_DELIVERY_MODE", "development");
  await s.t.run(async (ctx) => {
    await ctx.db.patch(eventId, {
      status: "published",
      resultsPublished: true,
    });
    const { results } = await import("./model/campaigns");
    await results(ctx, (await ctx.db.get(eventId))!);
  });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const removed = await s.t.mutation(internal.testCleanup.removeBatch, {
    eventId,
    table: "emailCampaigns",
  });
  expect(removed.removed).toBe(1);
}, 30000);
