import { v } from "convex/values";
export const answer = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.null(),
  v.array(v.string()),
);
export const theme = v.object({
  preset: v.optional(v.union(
    v.literal("nocturnal"),
    v.literal("editorial"),
    v.literal("electric"),
    v.literal("botanical"),
    v.literal("custom"),
  )),
  mode: v.union(v.literal("dark"), v.literal("light")),
  colors: v.object({
    primary: v.string(),
    secondary: v.string(),
    accent: v.string(),
    background: v.string(),
    surface: v.string(),
    text: v.string(),
  }),
  fonts: v.object({ heading: v.string(), body: v.string() }),
  radius: v.union(
    v.literal("none"),
    v.literal("sm"),
    v.literal("md"),
    v.literal("lg"),
    v.literal("full"),
  ),
  cursorEffect: v.optional(
    v.object({ enabled: v.boolean(), intensity: v.number() }),
  ),
  logoId: v.optional(v.id("_storage")),
  bannerId: v.optional(v.id("_storage")),
  faviconId: v.optional(v.id("_storage")),
  ogImageId: v.optional(v.id("_storage")),
});
export const block = v.object({
  id: v.string(),
  type: v.union(
    ...[
      "hero",
      "about",
      "tracks",
      "prizes",
      "timeline",
      "schedule",
      "sponsors",
      "judges",
      "mentors",
      "faq",
      "resources",
      "rules",
      "cta_register",
      "gallery",
      "custom_markdown",
    ].map((t) => v.literal(t)),
  ),
  visible: v.boolean(),
  visibleFrom: v.optional(v.string()),
  style: v.optional(v.object({
    width: v.union(v.literal("contained"), v.literal("wide"), v.literal("full")),
    align: v.union(v.literal("left"), v.literal("center"), v.literal("right")),
    spacing: v.union(v.literal("compact"), v.literal("normal"), v.literal("spacious")),
    surface: v.union(v.literal("none"), v.literal("surface")),
    backgroundColor: v.optional(v.string()),
    textColor: v.optional(v.string()),
  })),
  content: v.record(v.string(), answer),
});
export const field = v.object({
  id: v.string(),
  type: v.union(
    ...[
      "short_text",
      "long_text",
      "email",
      "url",
      "number",
      "select",
      "multi_select",
      "checkbox",
      "date",
      "file",
      "country",
      "phone",
      "github_url",
      "stellar_address",
      "contract_id",
      "section_header",
    ].map((t) => v.literal(t)),
  ),
  label: v.string(),
  staffVisibility: v.optional(
    v.union(v.literal("reviewers"), v.literal("organizers")),
  ),
  help: v.optional(v.string()),
  placeholder: v.optional(v.string()),
  required: v.boolean(),
  options: v.optional(
    v.array(v.object({ value: v.string(), label: v.string() })),
  ),
  validation: v.optional(
    v.object({
      min: v.optional(v.number()),
      max: v.optional(v.number()),
      pattern: v.optional(v.string()),
      maxFileMB: v.optional(v.number()),
      accept: v.optional(v.string()),
    }),
  ),
  showIf: v.optional(v.object({ fieldId: v.string(), equals: answer })),
});
export const audience = v.object({
  kind: v.union(
    ...[
      "all",
      "approved",
      "pending",
      "teams_without_submission",
      "judges",
      "mentors",
      "filtered",
    ].map((t) => v.literal(t)),
  ),
  fieldId: v.optional(v.string()),
  equals: v.optional(answer),
});
