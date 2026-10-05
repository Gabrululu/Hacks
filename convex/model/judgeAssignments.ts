import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  roundFor,
  editableRound,
  eligibleJudge,
  conflict,
  freezeEvent,
} from "../lib/judgingAccess";
import { writeAudit } from "./auditLog";
export async function assign(
  ctx: MutationCtx,
  eventId: Id<"events">,
  roundId: Id<"judgingRounds">,
  judgeId: Id<"users">,
  submissionId: Id<"submissions">,
  automatic = false,
) {
  const { round, event } = await roundFor(ctx, eventId, roundId);
  if (automatic) {
    if (
      event.status !== "published" ||
      event.judgingClosed ||
      event.resultsPublished ||
      round.status !== "pending"
    )
      throw new ConvexError("ROUND_LOCKED");
  } else editableRound(event, round);
  if (
    event.status !== "published" ||
    Date.now() < event.timeline.submissionClosesAt ||
    Date.now() >= event.timeline.judgingClosesAt
  )
    throw new ConvexError("JUDGING_NOT_AVAILABLE");
  const project = await ctx.db.get(submissionId);
  if (!project || project.eventId !== eventId || project.status !== "admitted")
    throw new ConvexError("PROJECT_NOT_ADMITTED");
  if (!(await eligibleJudge(ctx, eventId, judgeId)))
    throw new ConvexError("INVALID_JUDGE");
  if (await conflict(ctx, eventId, judgeId, project.teamId))
    throw new ConvexError("CONFLICT_OF_INTEREST");
  const assignments = await ctx.db
    .query("judgeAssignments")
    .withIndex("by_eventId_and_roundId_and_submissionId", (q) =>
      q
        .eq("eventId", eventId)
        .eq("roundId", roundId)
        .eq("submissionId", submissionId),
    )
    .take(21);
  const existing = assignments.find((a) => a.judgeId === judgeId);
  if (existing) {
    if (existing.status === "abstained")
      throw new ConvexError("JUDGE_ABSTAINED");
    return existing._id;
  }
  if (assignments.length >= 20) throw new ConvexError("PROJECT_JUDGE_LIMIT");
  const load = await ctx.db
    .query("judgeAssignments")
    .withIndex("by_event_judge_round", (q) =>
      q.eq("eventId", eventId).eq("judgeId", judgeId).eq("roundId", roundId),
    )
    .take(101);
  if (load.length >= 100) throw new ConvexError("JUDGE_LOAD_LIMIT");
  const version = await ctx.db
    .query("submissionVersions")
    .withIndex("by_eventId_and_submissionId", (q) =>
      q.eq("eventId", eventId).eq("submissionId", submissionId),
    )
    .order("desc")
    .first();
  if (!version || version.version !== project.submissionVersion)
    throw new ConvexError("PROJECT_VERSION_MISSING");
  await freezeEvent(ctx, event);
  if (
    !(await ctx.db
      .query("roundProjects")
      .withIndex("by_eventId_and_roundId_and_submissionId", (q) =>
        q
          .eq("eventId", eventId)
          .eq("roundId", roundId)
          .eq("submissionId", submissionId),
      )
      .unique())
  )
    await ctx.db.insert("roundProjects", {
      eventId,
      roundId,
      submissionId,
      versionId: version._id,
    });
  return ctx.db.insert("judgeAssignments", {
    eventId,
    roundId,
    judgeId,
    submissionId,
    versionId: version._id,
    status: "assigned",
    revision: 1,
  });
}
export async function remove(
  ctx: MutationCtx,
  eventId: Id<"events">,
  id: Id<"judgeAssignments">,
) {
  const a = await ctx.db.get(id);
  if (!a || a.eventId !== eventId) throw new ConvexError("NOT_FOUND");
  const { event, round } = await roundFor(ctx, eventId, a.roundId);
  editableRound(event, round);
  await ctx.db.delete(id);
  const remaining = await ctx.db
    .query("judgeAssignments")
    .withIndex("by_eventId_and_roundId_and_submissionId", (q) =>
      q
        .eq("eventId", eventId)
        .eq("roundId", a.roundId)
        .eq("submissionId", a.submissionId),
    )
    .first();
  if (!remaining) {
    const row = await ctx.db
      .query("roundProjects")
      .withIndex("by_eventId_and_roundId_and_submissionId", (q) =>
        q
          .eq("eventId", eventId)
          .eq("roundId", a.roundId)
          .eq("submissionId", a.submissionId),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
  }
  return null;
}
export async function markScored(ctx: MutationCtx, a: Doc<"judgeAssignments">) {
  await ctx.db.patch(a._id, {
    status: "scored",
    revision: (a.revision ?? 0) + 1,
  });
}
export async function abstain(
  ctx: MutationCtx,
  user: Doc<"users">,
  a: Doc<"judgeAssignments">,
  reason: string,
  revision: number,
) {
  if ((a.revision ?? 0) !== revision) throw new ConvexError("JUDGING_CONFLICT");
  if (!reason.trim() || reason.length > 2000 || a.status === "abstained")
    throw new ConvexError("INVALID_ABSTENTION");
  const score = await ctx.db
    .query("scores")
    .withIndex("by_event_assignment", (q) =>
      q.eq("eventId", a.eventId).eq("assignmentId", a._id),
    )
    .unique();
  if (score) throw new ConvexError("SCORED_ASSIGNMENT_LOCKED");
  await ctx.db.patch(a._id, {
    status: "abstained",
    abstainReason: reason.trim(),
    revision: revision + 1,
  });
  await writeAudit(ctx, user._id, "judging.abstain", a.eventId, {
    targetTable: "judgeAssignments",
    targetId: a._id,
  });
  return null;
}
