import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { member, roster, participant } from "../lib/projectAccess";
import { validateAnswers, type Answers } from "../lib/formEngine";
import { projectFields, requireFiles } from "../lib/projectValidation";
import { published } from "./forms";
import { snapshot } from "./submissionVersions";
import { writeAudit } from "./auditLog";
export type Input = Pick<
  Doc<"submissions">,
  | "title"
  | "summary"
  | "trackIds"
  | "repoUrl"
  | "demoUrl"
  | "videoUrl"
  | "contractId"
  | "imageIds"
>;
export async function save(
  ctx: MutationCtx,
  user: Doc<"users">,
  teamId: Id<"teams">,
  input: Input,
  answers: Answers,
  expectedRevision: number,
) {
  const { team, event } = await member(ctx, user, teamId);
  if (
    event.judgingStartedAt !== undefined ||
    event.judgingClosed ||
    event.resultsPublished ||
    Date.now() < event.timeline.startsAt ||
    Date.now() >= event.timeline.submissionClosesAt
  )
    throw new ConvexError("SUBMISSION_CLOSED");
  const current = await ctx.db
    .query("submissions")
    .withIndex("by_event_team", (q) =>
      q.eq("eventId", team.eventId).eq("teamId", teamId),
    )
    .unique();
  if ((current?.revision ?? 0) !== expectedRevision)
    throw new ConvexError("PROJECT_CONFLICT");
  const form = current
      ? null
      : await published(ctx, team.eventId, "submission"),
    fields = current?.fieldSnapshot ?? form?.fields ?? [],
    formId = current?.formId ?? form?._id;
  await projectFields(ctx, team, input, false);
  const clean = validateAnswers(
    fields.map((f) => ({ ...f, required: false })),
    answers,
  );
  await requireFiles(ctx, team, fields, clean, "submission", formId);
  const data = {
    ...input,
    title: input.title.trim(),
    summary: input.summary.trim(),
    repoUrl: input.repoUrl || undefined,
    demoUrl: input.demoUrl || undefined,
    videoUrl: input.videoUrl || undefined,
    contractId: input.contractId || undefined,
    eventId: team.eventId,
    teamId,
    answers: clean,
    formId,
    fieldSnapshot: fields,
    formVersion: current?.formVersion ?? form?.version ?? 0,
    revision: expectedRevision + 1,
    status: "draft" as const,
    reviewedBy: undefined,
    reviewReason: undefined,
  };
  let id;
  if (current) {
    await ctx.db.patch(current._id, data);
    id = current._id;
  } else id = await ctx.db.insert("submissions", data);
  await writeAudit(ctx, user._id, "project.save", team.eventId, {
    targetTable: "submissions",
    targetId: id,
  });
  return id;
}
export async function submit(
  ctx: MutationCtx,
  user: Doc<"users">,
  id: Id<"submissions">,
  expectedRevision: number,
) {
  const row = await ctx.db.get(id);
  if (!row) throw new ConvexError("NOT_FOUND");
  const { team, event } = await member(ctx, user, row.teamId);
  if (
    event.judgingStartedAt !== undefined ||
    event.judgingClosed ||
    event.resultsPublished ||
    Date.now() < event.timeline.submissionOpensAt ||
    Date.now() >= event.timeline.submissionClosesAt
  )
    throw new ConvexError("SUBMISSION_CLOSED");
  if ((row.revision ?? 0) !== expectedRevision)
    throw new ConvexError("PROJECT_CONFLICT");
  const members = await roster(ctx, team);
  if (
    members.length < event.settings.teamSizeMin ||
    members.length > event.settings.teamSizeMax
  )
    throw new ConvexError("TEAM_SIZE_INVALID");
  for (const m of members) {
    const u = await ctx.db.get(m.userId);
    if (!u || u.suspendedAt !== undefined)
      throw new ConvexError("REGISTRATION_NOT_APPROVED");
    await participant(ctx, u, event._id);
  }
  await projectFields(ctx, team, row, true);
  const clean = validateAnswers(row.fieldSnapshot ?? [], row.answers);
  await requireFiles(
    ctx,
    team,
    row.fieldSnapshot ?? [],
    clean,
    "submission",
    row.formId,
  );
  const cps = await ctx.db
    .query("checkpointSubmissions")
    .withIndex("by_event_team", (q) =>
      q.eq("eventId", event._id).eq("teamId", team._id),
    )
    .take(53);
  if (
    cps.filter((c) => c.status === "accepted").length <
    event.settings.requiredCheckpoints
  )
    throw new ConvexError("CHECKPOINT_GATE");
  await ctx.db.patch(id, {
    status: "submitted",
    answers: clean,
    submittedAt: Date.now(),
    submissionVersion: (row.submissionVersion ?? 0) + 1,
    revision: expectedRevision + 1,
    reviewReason: undefined,
    reviewedBy: undefined,
  });
  await snapshot(ctx, (await ctx.db.get(id))!, user._id);
  await writeAudit(ctx, user._id, "project.submit", event._id, {
    targetTable: "submissions",
    targetId: id,
  });
  return null;
}
export async function review(
  ctx: MutationCtx,
  user: Doc<"users">,
  eventId: Id<"events">,
  id: Id<"submissions">,
  status: "admitted" | "disqualified",
  reason: string,
  expectedRevision: number,
) {
  const row = await ctx.db.get(id),
    event = await ctx.db.get(eventId);
  if (!row || row.eventId !== eventId) throw new ConvexError("NOT_FOUND");
  if (
    event?.status !== "published" ||
    event.judgingStartedAt !== undefined ||
    event.judgingClosed ||
    event.resultsPublished
  )
    throw new ConvexError("REVIEW_CLOSED");
  if ((row.revision ?? 0) !== expectedRevision)
    throw new ConvexError("PROJECT_CONFLICT");
  if (row.status === "draft") throw new ConvexError("PROJECT_NOT_SUBMITTED");
  if (reason.length > 2000 || (status === "disqualified" && !reason.trim()))
    throw new ConvexError("REVIEW_REASON_REQUIRED");
  await ctx.db.patch(id, {
    status,
    reviewedBy: user._id,
    reviewReason: reason.trim(),
    revision: (row.revision ?? 0) + 1,
  });
  return null;
}
