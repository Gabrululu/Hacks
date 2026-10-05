import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { type Field, type Answers, validStrKey } from "./formEngine";
export const DEFAULT_CHECKPOINT_FIELDS: Field[] = [
  {
    id: "progress",
    type: "long_text",
    label: "Avance del equipo",
    required: true,
  },
  {
    id: "repository",
    type: "github_url",
    label: "Repositorio",
    required: false,
  },
];
export function validUrl(value: string | undefined) {
  if (!value) return;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      value.length > 2000
    )
      throw Error();
  } catch {
    throw new ConvexError("INVALID_PROJECT_URL");
  }
}
export async function requireFiles(
  ctx: QueryCtx,
  team: Doc<"teams">,
  fields: Field[],
  answers: Answers,
  kind: "submission" | "checkpoint",
  formId?: Id<"forms">,
  checkpointId?: Id<"checkpoints">,
) {
  for (const field of fields) {
    const value = answers[field.id];
    if (field.type !== "file" || !value) continue;
    const fileId =
      typeof value === "string"
        ? ctx.db.system.normalizeId("_storage", value)
        : null;
    if (!fileId) throw new ConvexError("INVALID_FILE");
    const upload = await ctx.db
      .query("projectUploads")
      .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
      .unique();
    if (
      !upload ||
      upload.teamId !== team._id ||
      upload.eventId !== team.eventId ||
      upload.kind !== kind ||
      upload.fieldId !== field.id ||
      upload.formId !== formId ||
      upload.checkpointId !== checkpointId ||
      !(await ctx.db.system.get(fileId))
    )
      throw new ConvexError("INVALID_FILE");
  }
}
export async function projectFields(
  ctx: QueryCtx,
  team: Doc<"teams">,
  input: {
    title: string;
    summary: string;
    trackIds: Id<"tracks">[];
    repoUrl?: string;
    demoUrl?: string;
    videoUrl?: string;
    contractId?: string;
    imageIds: Id<"_storage">[];
  },
  final: boolean,
) {
  if (
    input.title.length > 120 ||
    input.summary.length > 10000 ||
    (final &&
      (input.title.trim().length < 3 || input.summary.trim().length < 20)) ||
    input.trackIds.length > 10 ||
    new Set(input.trackIds).size !== input.trackIds.length ||
    input.imageIds.length > 6 ||
    new Set(input.imageIds).size !== input.imageIds.length
  )
    throw new ConvexError("INVALID_PROJECT");
  for (const url of [input.repoUrl, input.demoUrl, input.videoUrl])
    validUrl(url);
  if (input.contractId && !validStrKey(input.contractId, 16))
    throw new ConvexError("INVALID_CONTRACT");
  for (const id of input.trackIds)
    if ((await ctx.db.get(id))?.eventId !== team.eventId)
      throw new ConvexError("INVALID_TRACK");
  for (const fileId of input.imageIds) {
    const upload = await ctx.db
      .query("projectUploads")
      .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
      .unique();
    if (
      !upload ||
      upload.teamId !== team._id ||
      upload.eventId !== team.eventId ||
      upload.kind !== "image" ||
      !(await ctx.db.system.get(fileId))
    )
      throw new ConvexError("INVALID_FILE");
  }
}
