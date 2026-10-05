import { v } from "convex/values";
import { block, theme } from "./validators";
export const trackInput = {
  name: v.string(),
  description: v.string(),
  prize: v.string(),
  order: v.number(),
};
export const resourceInput = {
  title: v.string(),
  kind: v.union(v.literal("link"), v.literal("file"), v.literal("markdown")),
  url: v.optional(v.string()),
  fileId: v.optional(v.id("_storage")),
  body: v.optional(v.string()),
  visibility: v.union(
    v.literal("public"),
    v.literal("registered"),
    v.literal("approved"),
    v.literal("staff"),
  ),
  order: v.number(),
  featuredFrom: v.optional(v.string()),
};
export const mentorInput = {
  name: v.string(),
  expertise: v.array(v.string()),
  contact: v.string(),
  availability: v.string(),
  publicContact: v.boolean(),
  photoId: v.optional(v.id("_storage")),
};
export const resourceView = v.object({
  id: v.id("resources"),
  title: v.string(),
  kind: resourceInput.kind,
  url: v.optional(v.string()),
  body: v.optional(v.string()),
  visibility: resourceInput.visibility,
  featuredFrom: v.optional(v.string()),
});
export const pageView = v.object({
  publicGallery: v.boolean(),
  slug: v.string(),
  name: v.string(),
  tagline: v.string(),
  description: v.string(),
  status: v.string(),
  timezone: v.string(),
  phase: v.string(),
  theme,
  blocks: v.array(block),
  timeline: v.record(v.string(), v.number()),
  images: v.record(v.string(), v.string()),
  tracks: v.array(
    v.object({
      id: v.id("tracks"),
      name: v.string(),
      description: v.string(),
      prize: v.string(),
    }),
  ),
  mentors: v.array(
    v.object({
      name: v.string(),
      expertise: v.array(v.string()),
      contact: v.string(),
      availability: v.string(),
      photo: v.union(v.string(), v.null()),
    }),
  ),
  judges: v.array(v.object({ name: v.string(), bio: v.string() })),
  resources: v.array(resourceView),
});
