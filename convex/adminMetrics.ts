import { v } from "convex/values";
import { superAdminMutation, superAdminQuery } from "./lib/functions";
import {
  eventMetrics,
  registrationMetrics,
  projectMetrics,
  emailMetrics,
} from "./lib/metrics";
const table = v.union(
  v.literal("events"),
  v.literal("registrations"),
  v.literal("submissions"),
  v.literal("emailDeliveries"),
);
// Bounded, idempotent backfill: existing rows and live triggers share transactions.
export const backfill = superAdminMutation({
  args: { table, cursor: v.union(v.string(), v.null()) },
  returns: v.object({ cursor: v.string(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const opts = { cursor: args.cursor, numItems: 100 };
    if (args.table === "events") {
      const p = await ctx.db
        .query("events")
        .withIndex("by_creation_time")
        .paginate(opts);
      for (const d of p.page) await eventMetrics.insertIfDoesNotExist(ctx, d);
      return { cursor: p.continueCursor, done: p.isDone };
    }
    if (args.table === "registrations") {
      const p = await ctx.db
        .query("registrations")
        .withIndex("by_creation_time")
        .paginate(opts);
      for (const d of p.page)
        await registrationMetrics.insertIfDoesNotExist(ctx, d);
      return { cursor: p.continueCursor, done: p.isDone };
    }
    if (args.table === "submissions") {
      const p = await ctx.db
        .query("submissions")
        .withIndex("by_creation_time")
        .paginate(opts);
      for (const d of p.page) await projectMetrics.insertIfDoesNotExist(ctx, d);
      return { cursor: p.continueCursor, done: p.isDone };
    }
    const p = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_creation_time")
      .paginate(opts);
    for (const d of p.page) await emailMetrics.insertIfDoesNotExist(ctx, d);
    return { cursor: p.continueCursor, done: p.isDone };
  },
});
export const totals = superAdminQuery({
  args: {},
  returns: v.object({
    events: v.number(),
    registrations: v.number(),
    projects: v.number(),
    emails: v.number(),
  }),
  handler: async (ctx) => {
    const [
      events,
      registrations,
      projects,
      sent,
      delivered,
      delayed,
      bounced,
      complained,
    ] = await Promise.all([
      eventMetrics.count(ctx),
      registrationMetrics.count(ctx),
      projectMetrics.count(ctx),
      ...["sent", "delivered", "delivery_delayed", "bounced", "complained"].map(
        (status) =>
          emailMetrics.count(ctx, {
            bounds: {
              lower: { key: status, inclusive: true },
              upper: { key: status, inclusive: true },
            },
          }),
      ),
    ]);
    return {
      events,
      registrations,
      projects,
      emails: sent + delivered + delayed + bounced + complained,
    };
  },
});
