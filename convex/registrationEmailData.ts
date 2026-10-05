import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { mark } from "./model/registrationNotifications";
export const get = internalQuery({
  args: { id: v.id("registrationNotifications") },
  returns: v.union(
    v.null(),
    v.object({ email: v.string(), subject: v.string(), body: v.string() }),
  ),
  handler: async (ctx, a) => {
    const n = await ctx.db.get(a.id);
    if (!n || n.delivery !== "queued") return null;
    const user = await ctx.db.get(n.userId);
    if (!user?.email || !user.emailVerifiedAt || user.suspendedAt !== undefined)
      return null;
    return { email: user.email, subject: n.subject, body: n.body };
  },
});
export const markDelivery = internalMutation({
  args: {
    id: v.id("registrationNotifications"),
    delivery: v.union(
      v.literal("development"),
      v.literal("sent"),
      v.literal("failed"),
    ),
  },
  returns: v.null(),
  handler: (ctx, a) => mark(ctx, a.id, a.delivery),
});
