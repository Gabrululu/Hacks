import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
export async function snapshot(
  ctx: MutationCtx,
  row: Doc<"submissions">,
  userId: Id<"users">,
) {
  return ctx.db.insert("submissionVersions", {
    eventId: row.eventId,
    submissionId: row._id,
    teamId: row.teamId,
    version: row.submissionVersion ?? 1,
    submittedBy: userId,
    submittedAt: row.submittedAt!,
    title: row.title,
    summary: row.summary,
    trackIds: row.trackIds,
    repoUrl: row.repoUrl,
    demoUrl: row.demoUrl,
    videoUrl: row.videoUrl,
    contractId: row.contractId,
    imageIds: row.imageIds,
    formVersion: row.formVersion,
    fieldSnapshot: row.fieldSnapshot ?? [],
    answers: row.answers,
  });
}
