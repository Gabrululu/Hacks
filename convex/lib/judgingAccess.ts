import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { can } from "./permissions";
export async function roundFor(
  ctx: QueryCtx,
  eventId: Id<"events">,
  roundId: Id<"judgingRounds">,
) {
  const round = await ctx.db.get(roundId),
    event = await ctx.db.get(eventId);
  if (!round || round.eventId !== eventId || !event)
    throw new ConvexError("NOT_FOUND");
  return { round, event };
}
export async function rubricFor(ctx: QueryCtx, round: Doc<"judgingRounds">) {
  const rubric = await ctx.db
    .query("rubrics")
    .withIndex("by_eventId_and_roundId", (q) =>
      q.eq("eventId", round.eventId).eq("roundId", round._id),
    )
    .unique();
  if (!rubric) throw new ConvexError("RUBRIC_REQUIRED");
  return rubric;
}
export function editableRound(
  event: Doc<"events">,
  round: Doc<"judgingRounds">,
) {
  if (
    event.status === "archived" ||
    event.judgingClosed ||
    event.resultsPublished ||
    round.status !== "pending" ||
    round.autoState === "running"
  )
    throw new ConvexError("ROUND_LOCKED");
}
export async function eligibleJudge(
  ctx: QueryCtx,
  eventId: Id<"events">,
  judgeId: Id<"users">,
) {
  const user = await ctx.db.get(judgeId);
  return (
    !!user &&
    user.suspendedAt === undefined &&
    (await can(ctx, user, eventId, "judging.score"))
  );
}
export async function conflict(
  ctx: QueryCtx,
  eventId: Id<"events">,
  judgeId: Id<"users">,
  teamId: Id<"teams">,
) {
  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", eventId).eq("userId", judgeId),
    )
    .unique();
  return membership?.teamId === teamId;
}
export async function ownAssignment(
  ctx: QueryCtx,
  user: Doc<"users">,
  id: Id<"judgeAssignments">,
) {
  const assignment = await ctx.db.get(id);
  if (
    !assignment ||
    assignment.judgeId !== user._id ||
    !(await can(ctx, user, assignment.eventId, "judging.score"))
  )
    throw new ConvexError("FORBIDDEN");
  const { event, round } = await roundFor(
      ctx,
      assignment.eventId,
      assignment.roundId,
    ),
    project = await ctx.db.get(assignment.submissionId);
  if (
    event.status !== "published" ||
    !project ||
    project.status !== "admitted" ||
    (await conflict(ctx, event._id, user._id, project.teamId))
  )
    throw new ConvexError("CONFLICT_OF_INTEREST");
  return { assignment, event, round, project };
}
export function scoringOpen(event: Doc<"events">, round: Doc<"judgingRounds">) {
  if (
    event.judgingClosed ||
    event.resultsPublished ||
    round.status !== "open" ||
    Date.now() >= event.timeline.judgingClosesAt
  )
    throw new ConvexError("JUDGING_CLOSED");
}
export async function freezeEvent(ctx: MutationCtx, event: Doc<"events">) {
  if (event.judgingStartedAt === undefined)
    await ctx.db.patch(event._id, { judgingStartedAt: Date.now() });
}
