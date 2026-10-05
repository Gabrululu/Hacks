import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { requireUser } from "./lib/permissions";
import { staffRole } from "./lib/manageValidators";
import * as invites from "./model/staffInvites";
export const create = internalMutation({
  args: {
    eventId: v.id("events"),
    role: staffRole,
    wallet: v.optional(v.string()),
    tokenHash: v.string(),
    email: v.optional(v.string()),
    token: v.optional(v.string()),
  },
  returns: v.id("staffInvites"),
  handler: async (ctx, args) =>
    invites.create(ctx, await requireUser(ctx), args),
});
export const claim = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.string(),
  handler: async (ctx, args) =>
    invites.claim(ctx, await requireUser(ctx), args.tokenHash),
});
export const preview = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      eventName: v.string(),
      slug: v.string(),
      role: v.string(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, { tokenHash }) => {
    const invite = await ctx.db
      .query("staffInvites")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!invite || invite.revokedAt !== undefined || invite.claimedBy)
      return null;
    const event = await ctx.db.get(invite.eventId);
    return event
      ? {
          eventName: event.name,
          slug: event.slug,
          role: invite.role,
          expiresAt: invite.expiresAt,
        }
      : null;
  },
});
