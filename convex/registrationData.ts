import { v, ConvexError } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { requireUser, can } from "./lib/permissions";
import * as registrations from "./model/registrations";
export const passData = internalQuery({
  args: { slug: v.string() },
  returns: v.object({
    id: v.id("registrations"),
    eventId: v.id("events"),
    name: v.string(),
    eventName: v.string(),
    wallet: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, a) => {
    const user = await requireUser(ctx),
      event = await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", a.slug))
        .unique();
    if (event?.status !== "published")
      throw new ConvexError("EVENT_NOT_PUBLISHED");
    const r = await ctx.db
      .query("registrations")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", event._id).eq("userId", user._id),
      )
      .unique();
    if (!r || !["approved", "checked_in"].includes(r.status))
      throw new ConvexError("NOT_APPROVED");
    return {
      id: r._id,
      eventId: event._id,
      name: r.nameSnapshot ?? user.name ?? "Builder",
      wallet: user.wallet,
      eventName: event.name,
      expiresAt: event.timeline.judgingClosesAt + 86400000,
    };
  },
});
export const checkIn = internalMutation({
  args: { eventId: v.id("events"), id: v.id("registrations") },
  returns: v.union(v.literal("checked_in"), v.literal("already_checked_in")),
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    if (!(await can(ctx, user, a.eventId, "registrations.review")))
      throw new ConvexError("FORBIDDEN");
    return registrations.checkIn(ctx, user, a.eventId, a.id);
  },
});
