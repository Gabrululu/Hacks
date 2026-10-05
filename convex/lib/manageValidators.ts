import { v } from "convex/values";
export const eventType = v.union(
  v.literal("hackathon"),
  v.literal("ideathon"),
  v.literal("buildathon"),
  v.literal("bootcamp"),
  v.literal("demo_day"),
  v.literal("other"),
);
export const staffRole = v.union(
  v.literal("co_organizer"),
  v.literal("reviewer"),
  v.literal("judge_lead"),
  v.literal("judge"),
  v.literal("mentor"),
  v.literal("comms"),
);
export const timeline = v.object({
  registrationOpensAt: v.number(),
  registrationClosesAt: v.number(),
  startsAt: v.number(),
  submissionOpensAt: v.number(),
  submissionClosesAt: v.number(),
  judgingClosesAt: v.number(),
  resultsAt: v.optional(v.number()),
});
export const settings = v.object({
  admission: v.union(
    v.literal("auto"),
    v.literal("manual"),
    v.literal("capped"),
  ),
  capacity: v.optional(v.number()),
  teamSizeMin: v.number(),
  teamSizeMax: v.number(),
  requiredCheckpoints: v.number(),
  judgesPerSubmission: v.number(),
  publicGallery: v.boolean(),
});
export const eventDetails = {
  name: v.string(),
  tagline: v.string(),
  description: v.string(),
  format: v.union(
    v.literal("online"),
    v.literal("onsite"),
    v.literal("hybrid"),
  ),
  location: v.string(),
  timezone: v.string(),
  timeline,
  settings,
};
export const applicationStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);
