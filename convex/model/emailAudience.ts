import { ConvexError, type Infer } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { audience } from "../lib/validators";
import { can, isEventOrganizer } from "../lib/permissions";
import { published } from "./forms";
export async function validateAudience(
  ctx: QueryCtx,
  eventId: Id<"events">,
  actor: Doc<"users">,
  filter: Infer<typeof audience>,
) {
  if (filter.kind !== "filtered") return;
  if (!(await can(ctx, actor, eventId, "registrations.view")))
    throw new ConvexError("FORBIDDEN");
  const form = await published(ctx, eventId);
  const field = form?.fields.find((f) => f.id === filter.fieldId);
  if (
    !field ||
    field.type === "file" ||
    field.type === "section_header" ||
    filter.equals === undefined ||
    (field.staffVisibility === "organizers" &&
      !(await isEventOrganizer(ctx, actor, eventId)))
  )
    throw new ConvexError("INVALID_AUDIENCE");
}
export async function optedOut(
  ctx: QueryCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
) {
  const pref = await ctx.db
    .query("eventEmailPreferences")
    .withIndex("by_eventId_and_userId", (q) =>
      q.eq("eventId", eventId).eq("userId", userId),
    )
    .unique();
  if (pref) return pref.optedOut;
  return !!(
    await ctx.db
      .query("registrations")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("userId", userId),
      )
      .unique()
  )?.emailOptOut;
}
export async function memberData(
  ctx: QueryCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
) {
  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", eventId).eq("userId", userId),
    )
    .first();
  const team = membership ? await ctx.db.get(membership.teamId) : null;
  return team?.active === false ? null : team;
}
export async function matches(
  ctx: QueryCtx,
  campaign: Doc<"emailCampaigns">,
  registration: Doc<"registrations">,
) {
  const kind = campaign.audience.kind;
  if (kind === "approved")
    return ["approved", "checked_in"].includes(registration.status);
  if (kind === "pending") return registration.status === "pending";
  if (kind === "filtered")
    return (
      JSON.stringify(registration.answers[campaign.audience.fieldId ?? ""]) ===
      JSON.stringify(campaign.audience.equals)
    );
  if (kind === "teams_without_submission") {
    const team = await memberData(ctx, campaign.eventId, registration.userId);
    if (!team) return false;
    const submission = await ctx.db
      .query("submissions")
      .withIndex("by_event_team", (q) =>
        q.eq("eventId", campaign.eventId).eq("teamId", team._id),
      )
      .first();
    return !submission || submission.status === "draft";
  }
  return kind === "all" && registration.status !== "withdrawn";
}
