import { v, ConvexError } from "convex/values";
import { internalMutation } from "./lib/functions";
export const apply = internalMutation({
  args: { hash: v.string() },
  returns: v.null(),
  handler: async (ctx, { hash }) => {
    const r = await ctx.db
      .query("emailRecipients")
      .withIndex("by_unsubscribeHash", (q) => q.eq("unsubscribeHash", hash))
      .unique();
    const c = r ? await ctx.db.get(r.campaignId) : null;
    if (
      !r ||
      !c ||
      c.category !== "announcement" ||
      !(await ctx.db.get(r.eventId))
    )
      throw new ConvexError("INVALID_UNSUBSCRIBE");
    const p = await ctx.db
      .query("eventEmailPreferences")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", r.eventId).eq("userId", r.userId),
      )
      .unique();
    if (p) await ctx.db.patch(p._id, { optedOut: true });
    else
      await ctx.db.insert("eventEmailPreferences", {
        eventId: r.eventId,
        userId: r.userId,
        optedOut: true,
      });
    return null;
  },
});
