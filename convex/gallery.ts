import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { publicQuery } from "./lib/functions";
const project = v.object({
  id: v.id("submissions"),
  title: v.string(),
  summary: v.string(),
  team: v.string(),
  imageIds: v.array(v.id("_storage")),
  tracks: v.array(v.string()),
  repoUrl: v.union(v.string(), v.null()),
  demoUrl: v.union(v.string(), v.null()),
  videoUrl: v.union(v.string(), v.null()),
});
function safeLink(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}
export const list = publicQuery({
  args: { slug: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(project),
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (
      !event ||
      event.status !== "published" ||
      !event.settings.publicGallery ||
      !event.resultsPublished
    )
      return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db
      .query("submissions")
      .withIndex("by_event_status", (q) =>
        q.eq("eventId", event._id).eq("status", "admitted"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (p) => {
        const team = await ctx.db.get(p.teamId);
        if (!team || team.active === false || team.mergedInto) return null;
        return {
          id: p._id,
          title: p.title,
          summary: p.summary,
          team: team.name,
          imageIds: p.imageIds.slice(0, 6),
          tracks: (
            await Promise.all(
              p.trackIds.slice(0, 10).map((id) => ctx.db.get(id)),
            )
          )
            .filter((t) => t?.eventId === event._id)
            .map((t) => t!.name),
          repoUrl: safeLink(p.repoUrl),
          demoUrl: safeLink(p.demoUrl),
          videoUrl: safeLink(p.videoUrl),
        };
      }),
    );
    return {
      ...result,
      page: page.filter((p): p is NonNullable<typeof p> => p !== null),
    };
  },
});

// Public images are authorized on every request; private form uploads never qualify.
import { internalQuery } from "./_generated/server";
export const image = internalQuery({
  args: { projectId: v.string(), imageId: v.string() },
  returns: v.union(v.id("_storage"), v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("submissions", args.projectId),
      fileId = ctx.db.system.normalizeId("_storage", args.imageId);
    if (!id || !fileId) return null;
    const p = await ctx.db.get(id);
    if (!p || p.status !== "admitted" || !p.imageIds.includes(fileId))
      return null;
    const event = await ctx.db.get(p.eventId),
      team = await ctx.db.get(p.teamId);
    if (
      !event ||
      event.status !== "published" ||
      !event.settings.publicGallery ||
      !event.resultsPublished ||
      !team ||
      team.active === false ||
      team.mergedInto
    )
      return null;
    const upload = await ctx.db
      .query("projectUploads")
      .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
      .unique();
    if (
      !upload ||
      upload.kind !== "image" ||
      upload.eventId !== p.eventId ||
      upload.teamId !== p.teamId
    )
      return null;
    return (await ctx.db.system.get(fileId)) ? fileId : null;
  },
});
