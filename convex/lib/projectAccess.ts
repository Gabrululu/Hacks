import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
export async function participant(
  ctx: QueryCtx,
  user: Doc<"users">,
  eventId: Id<"events">,
) {
  const event = await ctx.db.get(eventId);
  if (event?.status !== "published")
    throw new ConvexError("EVENT_NOT_PUBLISHED");
  const r = await ctx.db
    .query("registrations")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", eventId).eq("userId", user._id),
    )
    .unique();
  if (!r || !["approved", "checked_in"].includes(r.status))
    throw new ConvexError("REGISTRATION_NOT_APPROVED");
  return event;
}
export async function member(
  ctx: QueryCtx,
  user: Doc<"users">,
  teamId: Id<"teams">,
) {
  const team = await ctx.db.get(teamId);
  if (!team || team.active === false || team.mergedInto)
    throw new ConvexError("TEAM_NOT_ACTIVE");
  const event = await participant(ctx, user, team.eventId),
    membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", team.eventId).eq("userId", user._id),
      )
      .unique();
  if (membership?.teamId !== teamId) throw new ConvexError("FORBIDDEN");
  return { team, event, membership };
}
export async function roster(ctx: QueryCtx, team: Doc<"teams">) {
  return ctx.db
    .query("teamMembers")
    .withIndex("by_event_team", (q) =>
      q.eq("eventId", team.eventId).eq("teamId", team._id),
    )
    .take(21);
}
export async function unlocked(ctx: QueryCtx, team: Doc<"teams">) {
  const event = await ctx.db.get(team.eventId);
  if (
    event?.status !== "published" ||
    Date.now() >= event.timeline.submissionClosesAt
  )
    throw new ConvexError("TEAMS_CLOSED");
  const project = await ctx.db
    .query("submissions")
    .withIndex("by_event_team", (q) =>
      q.eq("eventId", team.eventId).eq("teamId", team._id),
    )
    .unique();
  if (project?.submittedAt !== undefined)
    throw new ConvexError("PROJECT_TEAM_LOCKED");
}
