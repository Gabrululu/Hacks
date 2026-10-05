import * as cleanup from "./model/testCleanup";
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { localOnly, fixtureEvent, purge, TABLES } from "./model/testCleanup";
export const tables = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: () => {
    localOnly();
    return TABLES;
  },
});
export const inventory = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({ id: v.id("events"), slug: v.string() }),
  ),
  handler: async (ctx, a) => {
    localOnly();
    const result = await ctx.db
      .query("events")
      .withIndex("by_creation_time")
      .paginate({ ...a.paginationOpts, numItems: 25 });
    const page = [];
    for (const e of result.page) {
      if (!/^build-browser-\d{13}$/.test(e.slug)) continue;
      try {
        await fixtureEvent(ctx, e._id);
        page.push({ id: e._id, slug: e.slug });
      } catch {
        /* Ambiguous data is preserved. */
      }
    }
    return { ...result, page };
  },
});
export const removeBatch = internalMutation({
  args: { eventId: v.id("events"), table: v.string() },
  returns: v.object({ removed: v.number(), more: v.boolean() }),
  handler: (ctx, a) => purge(ctx, a.eventId, a.table),
});
export const registerWallet = internalMutation({
  args: { wallet: v.string(), runId: v.string() },
  returns: v.null(),
  handler: (ctx, a) => cleanup.registerWallet(ctx, a.wallet, a.runId),
});
export const markLegacy = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: (ctx, a) => cleanup.markLegacy(ctx, a.eventId),
});
export const removeWalletBatch = internalMutation({
  args: { runId: v.string() },
  returns: v.object({ removed: v.number(), more: v.boolean() }),
  handler: (ctx, a) => cleanup.removeWalletBatch(ctx, a.runId),
});

export const runs = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ runId: v.string() })),
  handler: async (ctx, a) => {
    localOnly();
    const result = await ctx.db
      .query("testFixtures")
      .withIndex("by_runId")
      .paginate({ ...a.paginationOpts, numItems: 25 });
    return { ...result, page: result.page.map((r) => ({ runId: r.runId })) };
  },
});
