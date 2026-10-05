import { v } from "convex/values";
export const criterion = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  weight: v.number(),
  min: v.number(),
  max: v.number(),
});
export const resultState = v.union(
  v.literal("building"),
  v.literal("ranking"),
  v.literal("ready"),
  v.literal("failed"),
);
export const publicResult = v.object({
  id: v.id("judgingResults"),
  submissionId: v.id("submissions"),
  title: v.string(),
  summary: v.string(),
  teamName: v.string(),
  rank: v.union(v.number(), v.null()),
  score: v.number(),
  reviews: v.number(),
  abstentions: v.number(),
  pending: v.number(),
  eligible: v.boolean(),
  publicFeedback: v.array(v.string()),
});
