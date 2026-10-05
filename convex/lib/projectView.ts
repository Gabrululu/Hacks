import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { visibleAnswers } from "./formEngine";
export async function projectView(
  ctx: QueryCtx,
  row: Doc<"submissions">,
  organizer: boolean,
) {
  const data = visibleAnswers(row.fieldSnapshot ?? [], row.answers, organizer);
  return {
    id: row._id,
    eventId: row.eventId,
    teamId: row.teamId,
    teamName: (await ctx.db.get(row.teamId))?.name ?? "Equipo",
    title: row.title,
    summary: row.summary,
    trackIds: row.trackIds,
    repoUrl: row.repoUrl,
    demoUrl: row.demoUrl,
    videoUrl: row.videoUrl,
    contractId: row.contractId,
    imageIds: row.imageIds,
    projectLogoId: row.projectLogoId,
    formId: row.formId,
    formVersion: row.formVersion,
    ...data,
    status: row.status,
    revision: row.revision ?? 0,
    submissionVersion: row.submissionVersion ?? 0,
    submittedAt: row.submittedAt ?? null,
    reviewReason: row.reviewReason ?? null,
  };
}
export async function checkpointView(
  ctx: QueryCtx,
  row: Doc<"checkpointSubmissions">,
  organizer: boolean,
) {
  const cp = await ctx.db.get(row.checkpointId),
    data = visibleAnswers(
      row.fieldSnapshot ?? cp?.fieldSnapshot ?? [],
      row.answers,
      organizer,
    );
  return {
    id: row._id,
    teamId: row.teamId,
    teamName: (await ctx.db.get(row.teamId))?.name ?? "Equipo",
    checkpointId: row.checkpointId,
    title: cp?.title ?? "Checkpoint",
    ...data,
    revision: row.revision ?? 0,
    status: row.status,
    submittedAt: row.submittedAt,
    reviewReason: row.reviewReason ?? null,
  };
}
