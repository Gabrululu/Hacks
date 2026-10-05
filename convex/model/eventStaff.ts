import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  effectivePermissions,
} from "../lib/permissions";
type StaffRole = Exclude<Doc<"eventStaff">["role"], "owner">;
export async function addOwner(
  ctx: MutationCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
) {
  await ctx.db.insert("eventStaff", { eventId, userId, role: "owner" });
}
export async function assertGrant(
  ctx: MutationCtx,
  actor: Doc<"users">,
  eventId: Id<"events">,
  role: StaffRole,
  extra: string[] = [],
  revoked: string[] = [],
) {
  if (
    extra.length > PERMISSIONS.length ||
    revoked.length > PERMISSIONS.length ||
    [...extra, ...revoked].some(
      (p) => !PERMISSIONS.includes(p as (typeof PERMISSIONS)[number]),
    )
  )
    throw new ConvexError("INVALID_PERMISSIONS");
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError("NOT_FOUND");
  const own = await effectivePermissions(ctx, actor, eventId);
  if (!own.includes("staff.manage")) throw new ConvexError("FORBIDDEN");
  if (actor.platformRole === "superadmin" || event.ownerId === actor._id)
    return;
  if (own.includes("judges.manage")) own.push("judging.score");
  const granted = [...ROLE_PERMISSIONS[role], ...extra].filter(
    (p) => !revoked.includes(p),
  );
  if (granted.some((p) => !own.includes(p as (typeof PERMISSIONS)[number])))
    throw new ConvexError("PERMISSION_ESCALATION");
}
export async function claim(
  ctx: MutationCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
  role: StaffRole,
  inviteCreatedAt: number,
) {
  const existing = await ctx.db
    .query("eventStaff")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", eventId).eq("userId", userId),
    )
    .unique();
  if (existing?.revokedAt === undefined && existing)
    throw new ConvexError("ALREADY_STAFF");
  if (
    existing?.revokedAt !== undefined &&
    inviteCreatedAt <= existing.revokedAt
  )
    throw new ConvexError("INVITE_REVOKED");
  if (existing)
    await ctx.db.patch(existing._id, {
      role,
      revokedAt: undefined,
      extraPermissions: undefined,
      revokedPermissions: undefined,
    });
  else await ctx.db.insert("eventStaff", { eventId, userId, role });
}
export async function update(
  ctx: MutationCtx,
  actor: Doc<"users">,
  eventId: Id<"events">,
  args: {
    memberId: Id<"eventStaff">;
    role: StaffRole;
    extraPermissions: string[];
    revokedPermissions: string[];
  },
) {
  const member = await ctx.db.get(args.memberId);
  if (!member || member.eventId !== eventId || member.revokedAt !== undefined)
    throw new ConvexError("NOT_FOUND");
  if (member.role === "owner" || member.userId === actor._id)
    throw new ConvexError("PROTECTED_MEMBER");
  await assertGrant(
    ctx,
    actor,
    eventId,
    args.role,
    args.extraPermissions,
    args.revokedPermissions,
  );
  await ctx.db.patch(member._id, {
    role: args.role,
    extraPermissions: [...new Set(args.extraPermissions)],
    revokedPermissions: [...new Set(args.revokedPermissions)],
  });
  return null;
}
export async function revoke(
  ctx: MutationCtx,
  actor: Doc<"users">,
  eventId: Id<"events">,
  memberId: Id<"eventStaff">,
) {
  const member = await ctx.db.get(memberId);
  if (!member || member.eventId !== eventId || member.revokedAt !== undefined)
    throw new ConvexError("NOT_FOUND");
  if (member.role === "owner" || member.userId === actor._id)
    throw new ConvexError("PROTECTED_MEMBER");
  await ctx.db.patch(member._id, { revokedAt: Date.now() });
  return null;
}
