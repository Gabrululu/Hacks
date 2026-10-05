import { v, ConvexError } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser, can, isEventOrganizer } from "./lib/permissions";
import { member } from "./lib/projectAccess";
import { FILE_TYPES } from "./lib/formEngine";
import { published } from "./model/forms";
import { register } from "./model/projectUploads";
const args = {
  teamId: v.id("teams"),
  kind: v.union(
    v.literal("image"),
    v.literal("submission"),
    v.literal("checkpoint"),
  ),
  checkpointId: v.optional(v.id("checkpoints")),
  formId: v.optional(v.id("forms")),
  fieldId: v.string(),
};
type Args = {
  teamId: Id<"teams">;
  kind: "image" | "submission" | "checkpoint";
  checkpointId?: Id<"checkpoints">;
  formId?: Id<"forms">;
  fieldId: string;
};
async function authorize(ctx: QueryCtx, a: Args, now: number) {
  const user = await requireUser(ctx),
    { team, event } = await member(ctx, user, a.teamId);
  if (
    event.judgingStartedAt !== undefined ||
    event.judgingClosed ||
    event.resultsPublished ||
    now < event.timeline.startsAt ||
    now >= event.timeline.submissionClosesAt
  )
    throw new ConvexError("SUBMISSION_CLOSED");
  if (a.kind === "image") {
    if (a.fieldId !== "images" || a.formId || a.checkpointId)
      throw new ConvexError("INVALID_FILE");
    return {
      user,
      eventId: team.eventId,
      maxMB: 5,
      accept: ["image/png", "image/jpeg", "image/webp"],
    };
  }
  const project = await ctx.db
    .query("submissions")
    .withIndex("by_event_team", (q) =>
      q.eq("eventId", team.eventId).eq("teamId", team._id),
    )
    .unique();
  let fields, formId;
  if (a.kind === "checkpoint") {
    const cp = a.checkpointId ? await ctx.db.get(a.checkpointId) : null;
    if (
      !cp ||
      cp.eventId !== team.eventId ||
      now >= cp.dueAt ||
      project?.submittedAt !== undefined
    )
      throw new ConvexError("CHECKPOINT_CLOSED");
    fields = cp.fieldSnapshot ?? [];
    formId = cp.formId;
  } else {
    if (a.checkpointId) throw new ConvexError("INVALID_FILE");
    const form = project
      ? null
      : await published(ctx, team.eventId, "submission");
    fields = project?.fieldSnapshot ?? form?.fields ?? [];
    formId = project?.formId ?? form?._id;
  }
  const field = fields.find((f) => f.id === a.fieldId && f.type === "file");
  if (!field || formId !== a.formId) throw new ConvexError("FORM_CHANGED");
  return {
    user,
    eventId: team.eventId,
    maxMB: field.validation?.maxFileMB ?? 5,
    accept:
      field.validation?.accept?.split(",").map((s) => s.trim()) ?? FILE_TYPES,
  };
}
export const authorizeUpload = internalQuery({
  args: { ...args, now: v.number() },
  returns: v.object({ maxMB: v.number(), accept: v.array(v.string()) }),
  handler: async (ctx, a) => {
    const { maxMB, accept } = await authorize(ctx, a, a.now);
    return { maxMB, accept };
  },
});
export const registerUpload = internalMutation({
  args: {
    ...args,
    fileId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const limits = await authorize(ctx, a, Date.now()),
      meta = await ctx.db.system.get(a.fileId);
    if (
      !meta ||
      !meta.size ||
      meta.size > limits.maxMB * 1024 * 1024 ||
      !limits.accept.includes(a.contentType) ||
      (meta.contentType !== undefined && meta.contentType !== a.contentType)
    )
      throw new ConvexError("INVALID_FILE");
    return register(ctx, {
      eventId: limits.eventId,
      teamId: a.teamId,
      userId: limits.user._id,
      kind: a.kind,
      checkpointId: a.checkpointId,
      formId: a.formId,
      fieldId: a.fieldId,
      fileId: a.fileId,
      name: a.name.slice(0, 150),
    });
  },
});
export const download = internalQuery({
  args: {
    submissionId: v.optional(v.id("submissions")),
    checkpointSubmissionId: v.optional(v.id("checkpointSubmissions")),
    versionId: v.optional(v.id("submissionVersions")),
    imageId: v.optional(v.id("_storage")),
    fieldId: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({ fileId: v.id("_storage"), name: v.string() }),
  ),
  handler: async (ctx, a) => {
    const user = await requireUser(ctx);
    if (
      [a.submissionId, a.checkpointSubmissionId, a.versionId].filter(Boolean)
        .length !== 1
    )
      return null;
    const row = a.submissionId
      ? await ctx.db.get(a.submissionId)
      : a.checkpointSubmissionId
        ? await ctx.db.get(a.checkpointSubmissionId)
        : a.versionId
          ? await ctx.db.get(a.versionId)
          : null;
    if (!row) return null;
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", row.eventId).eq("userId", user._id),
      )
      .unique();
    const own = membership?.teamId === row.teamId;
    let assigned = false;
    if (
      !own &&
      !(await can(ctx, user, row.eventId, "submissions.view")) &&
      (await can(ctx, user, row.eventId, "judging.score"))
    ) {
      const event = await ctx.db.get(row.eventId);
      if (event?.status === "published" && "submissionId" in row) {
        const choices = await ctx.db
          .query("judgeAssignments")
          .withIndex("by_event_submission", (q) =>
            q.eq("eventId", row.eventId).eq("submissionId", row.submissionId),
          )
          .take(161);
        assigned = choices.some(
          (a) =>
            a.judgeId === user._id &&
            a.status !== "abstained" &&
            a.versionId === row._id,
        );
      }
    }
    if (
      !own &&
      !assigned &&
      !(await can(ctx, user, row.eventId, "submissions.view"))
    )
      return null;
    const field = a.fieldId
      ? row.fieldSnapshot?.find((f) => f.id === a.fieldId && f.type === "file")
      : null;
    if (
      field?.staffVisibility === "organizers" &&
      !own &&
      !(await isEventOrganizer(ctx, user, row.eventId))
    )
      return null;
    let fileId: Id<"_storage"> | null = null;
    if (
      a.imageId &&
      "imageIds" in row &&
      row.imageIds.includes(a.imageId) &&
      !a.fieldId
    )
      fileId = a.imageId;
    else if (field && !a.imageId && typeof row.answers[field.id] === "string")
      fileId = ctx.db.system.normalizeId(
        "_storage",
        row.answers[field.id] as string,
      );
    if (!fileId) return null;
    const upload = await ctx.db
      .query("projectUploads")
      .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
      .unique();
    if (
      !upload ||
      upload.eventId !== row.eventId ||
      upload.teamId !== row.teamId
    )
      return null;
    return { fileId, name: upload.name };
  },
});
