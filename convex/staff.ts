import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import schema from "./schema";
import { eventQuery, eventMutation } from "./lib/functions";
import { staffRole } from "./lib/manageValidators";
import * as members from "./model/eventStaff";
import * as invites from "./model/staffInvites";
export const list = eventQuery("staff.manage")({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      member: doc(schema, "eventStaff"),
      name: v.string(),
      wallet: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("eventStaff")
      .withIndex("by_event_and_revokedAt", (q) =>
        q.eq("eventId", args.eventId).eq("revokedAt", undefined),
      )
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (member) => {
          const user = await ctx.db.get(member.userId);
          return {
            member,
            name: user?.name ?? "Builder",
            wallet: user?.wallet ?? "",
          };
        }),
      ),
    };
  },
});
const inviteSummary = v.object({
  id: v.id("staffInvites"),
  role: v.string(),
  wallet: v.union(v.string(), v.null()),
  expiresAt: v.number(),
  claimed: v.boolean(),
  revoked: v.boolean(),
});
export const invitations = eventQuery("staff.manage")({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(inviteSummary),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("staffInvites")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((i) => ({
        id: i._id,
        role: i.role,
        wallet: i.wallet ?? null,
        expiresAt: i.expiresAt,
        claimed: !!i.claimedBy,
        revoked: i.revokedAt !== undefined,
      })),
    };
  },
});
export const update = eventMutation(
  "staff.manage",
  "staff.update",
)({
  args: {
    memberId: v.id("eventStaff"),
    role: staffRole,
    extraPermissions: v.array(v.string()),
    revokedPermissions: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) =>
    members.update(ctx, ctx.user, args.eventId, args),
});
export const revoke = eventMutation(
  "staff.manage",
  "staff.revoke",
)({
  args: { memberId: v.id("eventStaff") },
  returns: v.null(),
  handler: async (ctx, args) =>
    members.revoke(ctx, ctx.user, args.eventId, args.memberId),
});
export const revokeInvite = eventMutation(
  "staff.manage",
  "staff.invite.revoke",
)({
  args: { inviteId: v.id("staffInvites") },
  returns: v.null(),
  handler: async (ctx, args) =>
    invites.revoke(ctx, args.eventId, args.inviteId),
});
