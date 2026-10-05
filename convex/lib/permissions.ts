import { ConvexError } from "convex/values";
import type { GenericId } from "convex/values";
import type { QueryCtx, User } from "./types";
export const PERMISSIONS = [
  "event.edit",
  "event.publish",
  "event.delete",
  "page.edit",
  "forms.edit",
  "resources.manage",
  "registrations.view",
  "registrations.review",
  "registrations.export",
  "teams.manage",
  "submissions.view",
  "submissions.review",
  "judges.manage",
  "judging.assign",
  "judging.score",
  "judging.close",
  "results.publish",
  "mentors.manage",
  "email.send",
  "announcements.post",
  "staff.manage",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  owner: PERMISSIONS.filter((p) => p !== "judging.score"),
  co_organizer: PERMISSIONS.filter(
    (p) => p !== "event.delete" && p !== "judging.score",
  ),
  reviewer: [
    "registrations.view",
    "registrations.review",
    "registrations.export",
    "submissions.view",
    "submissions.review",
  ],
  judge_lead: [
    "submissions.view",
    "judges.manage",
    "judging.assign",
    "judging.score",
    "judging.close",
    "results.publish",
  ],
  judge: ["judging.score"],
  mentor: ["submissions.view"],
  comms: ["email.send", "announcements.post"],
};
export async function requireUser(ctx: QueryCtx): Promise<User> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("UNAUTHENTICATED");
  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user || user.suspendedAt !== undefined)
    throw new ConvexError("FORBIDDEN");
  const sessionId =
    typeof identity.sessionId === "string"
      ? ctx.db.normalizeId("authSessions", identity.sessionId)
      : null;
  const session = sessionId ? await ctx.db.get(sessionId) : null;
  if (
    !session ||
    session.userId !== user._id ||
    (session.userSessionVersion ?? 0) !== (user.sessionVersion ?? 0) ||
    session.revokedAt !== undefined ||
    session.expiresAt <= Date.now()
  )
    throw new ConvexError("SESSION_EXPIRED");
  return user;
}
export async function effectivePermissions(
  ctx: QueryCtx,
  user: User,
  eventId: GenericId<"events">,
): Promise<Permission[]> {
  const event = await ctx.db.get(eventId);
  if (user.suspendedAt !== undefined || !event) return [];
  if (user.platformRole === "superadmin") return [...PERMISSIONS];
  if (event.status === "suspended") return [];
  const staff = await ctx.db
    .query("eventStaff")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", eventId).eq("userId", user._id),
    )
    .take(8);
  const organizationMember = event.organizationId
    ? await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization_and_user", (q) =>
          q.eq("organizationId", event.organizationId!).eq("userId", user._id),
        )
        .first()
    : null;
  if (organizationMember && organizationMember.revokedAt === undefined)
    return [...PERMISSIONS];
  return PERMISSIONS.filter((permission) =>
    staff.some(
      (s) =>
        s.revokedAt === undefined &&
        !s.revokedPermissions?.includes(permission) &&
        (ROLE_PERMISSIONS[s.role].includes(permission) ||
          s.extraPermissions?.includes(permission)),
    ),
  );
}
export async function can(
  ctx: QueryCtx,
  user: User,
  eventId: GenericId<"events">,
  permission: Permission,
) {
  return (await effectivePermissions(ctx, user, eventId)).includes(permission);
}

export async function isEventOrganizer(
  ctx: QueryCtx,
  user: User,
  eventId: GenericId<"events">,
) {
  if (user.platformRole === "superadmin") return true;
  const staff = await ctx.db
    .query("eventStaff")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", eventId).eq("userId", user._id),
    )
    .take(8);
  return staff.some(
    (s) =>
      s.revokedAt === undefined && ["owner", "co_organizer"].includes(s.role),
  );
}
