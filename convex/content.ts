import { contrast } from "./lib/presentation";
import { v, ConvexError } from "convex/values";
import { doc } from "convex-helpers/validators";
import schema from "./schema";
import { authedQuery, eventQuery, eventMutation } from "./lib/functions";
import { theme, block } from "./lib/validators";
import {
  trackInput,
  resourceInput,
  mentorInput,
  pageView,
  resourceView as resourceValidator,
} from "./lib/contentValidators";
import { getPage, resourceView } from "./lib/pageView";
import { effectivePermissions } from "./lib/permissions";
import * as events from "./model/events";
import * as tracks from "./model/tracks";
import * as resources from "./model/resources";
import * as mentors from "./model/mentors";
export const saveTheme = eventMutation(
  "page.edit",
  "theme.update",
)({
  args: { theme, expectedVersion: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, a) => {
    await events.savePresentation(ctx, a.eventId, a.expectedVersion, {
      theme: a.theme,
    });
    return contrast(a.theme.colors.text, a.theme.colors.background) < 4.5 ||
      contrast(a.theme.colors.text, a.theme.colors.surface) < 4.5
      ? ["LOW_CONTRAST_AA"]
      : [];
  },
});
export const saveBlocks = eventMutation(
  "page.edit",
  "page.update",
)({
  args: { blocks: v.array(block), expectedVersion: v.number() },
  returns: v.null(),
  handler: (ctx, a) =>
    events.savePresentation(ctx, a.eventId, a.expectedVersion, {
      blocks: a.blocks,
    }),
});
export const status = eventMutation(
  "event.publish",
  "event.status",
)({
  args: {
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
  },
  returns: v.null(),
  handler: (ctx, a) => events.changeStatus(ctx, a.eventId, a.status),
});
export const preview = authedQuery({
  args: { eventId: v.id("events") },
  returns: pageView,
  handler: async (ctx, a) => {
    const event = await ctx.db.get(a.eventId);
    if (!event) throw new ConvexError("NOT_FOUND");
    const membership = await ctx.db
      .query("eventStaff")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", a.eventId).eq("userId", ctx.user._id),
      )
      .first();
    if (
      ctx.user.platformRole !== "superadmin" &&
      (!membership || membership.revokedAt !== undefined)
    )
      throw new ConvexError("FORBIDDEN");
    return getPage(ctx, event, true);
  },
});
export const tracksList = eventQuery("resources.manage")({
  args: {},
  returns: v.array(doc(schema, "tracks")),
  handler: async (ctx, a) =>
    (
      await ctx.db
        .query("tracks")
        .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
        .take(50)
    ).sort((a, b) => a.order - b.order),
});
export const saveTrack = eventMutation(
  "resources.manage",
  "track.save",
)({
  args: { id: v.optional(v.id("tracks")), ...trackInput },
  returns: v.id("tracks"),
  handler: (ctx, a) => {
    const { eventId, id, ...input } = a;
    return tracks.save(ctx, eventId, id, input);
  },
});
export const removeTrack = eventMutation(
  "resources.manage",
  "track.remove",
)({
  args: { id: v.id("tracks") },
  returns: v.null(),
  handler: (ctx, a) => tracks.remove(ctx, a.eventId, a.id),
});
export const resourcesList = eventQuery("resources.manage")({
  args: {},
  returns: v.array(doc(schema, "resources")),
  handler: async (ctx, a) =>
    (
      await ctx.db
        .query("resources")
        .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
        .take(100)
    ).sort((a, b) => a.order - b.order),
});
export const saveResource = eventMutation(
  "resources.manage",
  "resource.save",
)({
  args: { id: v.optional(v.id("resources")), ...resourceInput },
  returns: v.id("resources"),
  handler: (ctx, a) => {
    const { eventId, id, ...input } = a;
    return resources.save(ctx, eventId, id, input);
  },
});
export const removeResource = eventMutation(
  "resources.manage",
  "resource.remove",
)({
  args: { id: v.id("resources") },
  returns: v.null(),
  handler: (ctx, a) => resources.remove(ctx, a.eventId, a.id),
});
export const mentorsList = eventQuery("mentors.manage")({
  args: {},
  returns: v.array(doc(schema, "mentors")),
  handler: async (ctx, a) =>
    ctx.db
      .query("mentors")
      .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
      .take(50),
});
export const saveMentor = eventMutation(
  "mentors.manage",
  "mentor.save",
)({
  args: { id: v.optional(v.id("mentors")), ...mentorInput },
  returns: v.id("mentors"),
  handler: (ctx, a) => {
    const { eventId, id, ...input } = a;
    return mentors.save(ctx, eventId, id, input);
  },
});
export const removeMentor = eventMutation(
  "mentors.manage",
  "mentor.remove",
)({
  args: { id: v.id("mentors") },
  returns: v.null(),
  handler: (ctx, a) => mentors.remove(ctx, a.eventId, a.id),
});
export const viewerResources = authedQuery({
  args: { slug: v.string() },
  returns: v.array(resourceValidator),
  handler: async (ctx, a) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", a.slug))
      .unique();
    if (!event) return [];
    const permissions = await effectivePermissions(ctx, ctx.user, event._id);
    if (event.status !== "published" && !permissions.length) return [];
    const all = await ctx.db
      .query("resources")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .take(100);
    const allowed = await Promise.all(
      all.map(async (r) => ((await resources.allowed(ctx, r)) ? r : null)),
    );
    return allowed
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.order - b.order)
      .map(resourceView);
  },
});
