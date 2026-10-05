import { v } from "convex/values";
import { field, answer } from "./validators";
export const projectInput = {
  title: v.string(),
  summary: v.string(),
  trackIds: v.array(v.id("tracks")),
  repoUrl: v.optional(v.string()),
  demoUrl: v.optional(v.string()),
  videoUrl: v.optional(v.string()),
  contractId: v.optional(v.string()),
  imageIds: v.array(v.id("_storage")),
};
export const projectStatus = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("admitted"),
  v.literal("disqualified"),
);
export const projectView = v.object({
  id: v.id("submissions"),
  eventId: v.id("events"),
  teamId: v.id("teams"),
  teamName: v.string(),
  ...projectInput,
  projectLogoId: v.optional(v.id("_storage")),
  formId: v.optional(v.id("forms")),
  formVersion: v.number(),
  fields: v.array(field),
  answers: v.record(v.string(), answer),
  status: projectStatus,
  revision: v.number(),
  submissionVersion: v.number(),
  submittedAt: v.union(v.number(), v.null()),
  reviewReason: v.union(v.string(), v.null()),
});
export const checkpointResponse = v.object({
  id: v.id("checkpointSubmissions"),
  teamId: v.id("teams"),
  teamName: v.string(),
  checkpointId: v.id("checkpoints"),
  title: v.string(),
  answers: v.record(v.string(), answer),
  fields: v.array(field),
  revision: v.number(),
  status: v.union(
    v.literal("submitted"),
    v.literal("accepted"),
    v.literal("rejected"),
  ),
  submittedAt: v.number(),
  reviewReason: v.union(v.string(), v.null()),
});
