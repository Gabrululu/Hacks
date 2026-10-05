import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { member } from "../lib/projectAccess";
import { validateAnswers, type Answers } from "../lib/formEngine";
import {
  DEFAULT_CHECKPOINT_FIELDS,
  requireFiles,
} from "../lib/projectValidation";
import { writeAudit } from "./auditLog";
export async function submit(
  ctx: MutationCtx,
  user: Doc<"users">,
  teamId: Id<"teams">,
  checkpointId: Id<"checkpoints">,
  answers: Answers,
  expectedRevision: number,
) {
  const { team, event } = await member(ctx, user, teamId),
    checkpoint = await ctx.db.get(checkpointId);
  if (!checkpoint || checkpoint.eventId !== team.eventId)
    throw new ConvexError("NOT_FOUND");
  if (
    Date.now() < event.timeline.startsAt ||
    Date.now() >= checkpoint.dueAt ||
    Date.now() >= event.timeline.submissionClosesAt
  )
    throw new ConvexError("CHECKPOINT_CLOSED");
  const project = await ctx.db
    .query("submissions")
    .withIndex("by_event_team", (q) =>
      q.eq("eventId", team.eventId).eq("teamId", teamId),
    )
    .unique();
  if (project?.submittedAt !== undefined)
    throw new ConvexError("PROJECT_TEAM_LOCKED");
  const current = await ctx.db
    .query("checkpointSubmissions")
    .withIndex("by_eventId_and_teamId_and_checkpointId", (q) =>
      q
        .eq("eventId", team.eventId)
        .eq("teamId", teamId)
        .eq("checkpointId", checkpointId),
    )
    .unique();
  if ((current?.revision ?? 0) !== expectedRevision)
    throw new ConvexError("PROJECT_CONFLICT");
  const fields = checkpoint.fieldSnapshot ?? DEFAULT_CHECKPOINT_FIELDS,
    clean = validateAnswers(fields, answers);
  await requireFiles(
    ctx,
    team,
    fields,
    clean,
    "checkpoint",
    checkpoint.formId,
    checkpointId,
  );
  const input = {
    eventId: team.eventId,
    teamId,
    checkpointId,
    answers: clean,
    submittedAt: Date.now(),
    submittedBy: user._id,
    status: "submitted" as const,
    revision: expectedRevision + 1,
    fieldSnapshot: fields,
    formVersion: checkpoint.formVersion ?? 0,
    reviewedBy: undefined,
    reviewReason: undefined,
  };
  const id = current
    ? current._id
    : await ctx.db.insert("checkpointSubmissions", input);
  if (current) await ctx.db.patch(id, input);
  await writeAudit(ctx, user._id, "checkpoint.submit", team.eventId, {
    targetTable: "checkpointSubmissions",
    targetId: id,
  });
  return id;
}
export async function review(
  ctx: MutationCtx,
  user: Doc<"users">,
  eventId: Id<"events">,
  id: Id<"checkpointSubmissions">,
  status: "accepted" | "rejected",
  reason: string,
  expectedRevision: number,
) {
  const row = await ctx.db.get(id),
    event = await ctx.db.get(eventId);
  if (
    event?.status !== "published" ||
    event.judgingClosed ||
    event.resultsPublished
  )
    throw new ConvexError("REVIEW_CLOSED");
  if (!row || row.eventId !== eventId) throw new ConvexError("NOT_FOUND");
  if ((row.revision ?? 0) !== expectedRevision)
    throw new ConvexError("PROJECT_CONFLICT");
  if (reason.length > 2000 || (status === "rejected" && !reason.trim()))
    throw new ConvexError("REVIEW_REASON_REQUIRED");
  const project = await ctx.db
    .query("submissions")
    .withIndex("by_event_team", (q) =>
      q.eq("eventId", eventId).eq("teamId", row.teamId),
    )
    .unique();
  if (project?.submittedAt !== undefined)
    throw new ConvexError("CHECKPOINT_REVIEW_LOCKED");
  await ctx.db.patch(id, {
    status,
    reviewedBy: user._id,
    reviewReason: reason.trim(),
    revision: (row.revision ?? 1) + 1,
  });
  return null;
}
export async function propagate(
  ctx: MutationCtx,
  eventId: Id<"events">,
  source: Id<"teams">,
  target: Id<"teams">,
) {
  const rows = await ctx.db
    .query("checkpointSubmissions")
    .withIndex("by_event_team", (q) =>
      q.eq("eventId", eventId).eq("teamId", source),
    )
    .take(53);
  if (rows.length > 52) throw new ConvexError("CHECKPOINT_LIMIT");
  const rank = { accepted: 3, submitted: 2, rejected: 1 };
  for (const row of rows) {
    const current = await ctx.db
      .query("checkpointSubmissions")
      .withIndex("by_eventId_and_teamId_and_checkpointId", (q) =>
        q
          .eq("eventId", eventId)
          .eq("teamId", target)
          .eq("checkpointId", row.checkpointId),
      )
      .unique();
    const { _id, _creationTime, ...copy } = row;
    void _id;
    void _creationTime;
    if (!current)
      await ctx.db.insert("checkpointSubmissions", {
        ...copy,
        teamId: target,
        originTeamId: row.originTeamId ?? source,
      });
    else if (rank[row.status] > rank[current.status])
      await ctx.db.patch(current._id, {
        ...copy,
        teamId: target,
        originTeamId: row.originTeamId ?? source,
        revision: (current.revision ?? 1) + 1,
      });
  }
}
