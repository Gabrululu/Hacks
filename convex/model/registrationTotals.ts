import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
export async function get(ctx: MutationCtx, eventId: Id<"events">) {
  const current = await ctx.db
    .query("registrationTotals")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
  if (current) return current;
  // Legacy registrations require a bounded bootstrap before starting a counter.
  const approved = await ctx.db
    .query("registrations")
    .withIndex("by_event_status", (q) =>
      q.eq("eventId", eventId).eq("status", "approved"),
    )
    .take(1001);
  const checked = await ctx.db
    .query("registrations")
    .withIndex("by_event_status", (q) =>
      q.eq("eventId", eventId).eq("status", "checked_in"),
    )
    .take(1001);
  if (approved.length + checked.length > 1000)
    throw new ConvexError("COUNTER_BACKFILL_REQUIRED");
  const id = await ctx.db.insert("registrationTotals", {
    eventId,
    admitted: approved.length + checked.length,
  });
  return (await ctx.db.get(id))!;
}
export async function adjust(
  ctx: MutationCtx,
  eventId: Id<"events">,
  delta: number,
) {
  const c = await get(ctx, eventId);
  if (c.admitted + delta < 0) throw new ConvexError("INVALID_COUNT");
  await ctx.db.patch(c._id, { admitted: c.admitted + delta });
}
