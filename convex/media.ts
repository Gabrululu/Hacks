import { v, ConvexError } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { authedQuery } from "./lib/functions";
import { requireUser, can } from "./lib/permissions";
import { register } from "./model/eventAssets";
import { allowed } from "./model/resources";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
const kind = v.union(v.literal("image"), v.literal("resource"));
async function authorize(
  ctx: QueryCtx,
  eventId: Id<"events">,
  kind: "image" | "resource",
) {
  const user = await requireUser(ctx);
  const event = await ctx.db.get(eventId);
  if (!event || event.status === "archived")
    throw new ConvexError("EVENT_ARCHIVED");
  if (
    !(await can(
      ctx,
      user,
      eventId,
      kind === "resource" ? "resources.manage" : "page.edit",
    )) &&
    !(kind === "image" && (await can(ctx, user, eventId, "mentors.manage")))
  )
    throw new ConvexError("FORBIDDEN");
  return user;
}
export const authorizeUpload = internalQuery({
  args: { eventId: v.id("events"), kind },
  returns: v.null(),
  handler: async (ctx, a) => {
    await authorize(ctx, a.eventId, a.kind);
    return null;
  },
});
export const registerUpload = internalMutation({
  args: {
    eventId: v.id("events"),
    kind,
    fileId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const user = await authorize(ctx, a.eventId, a.kind);
    return register(
      ctx,
      a.eventId,
      a.fileId,
      a.kind,
      a.name,
      user._id,
      a.contentType,
    );
  },
});
export const list = authedQuery({
  args: { eventId: v.id("events"), kind },
  returns: v.array(
    v.object({
      fileId: v.id("_storage"),
      name: v.string(),
      url: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, a) => {
    await authorize(ctx, a.eventId, a.kind);
    const assets = await ctx.db
      .query("eventAssets")
      .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
      .take(100);
    return Promise.all(
      assets
        .filter((f) => f.kind === a.kind)
        .map(async (f) => ({
          fileId: f.fileId,
          name: f.name,
          url: a.kind === "image" ? await ctx.storage.getUrl(f.fileId) : null,
        })),
    );
  },
});
export const download = internalQuery({
  args: { resourceId: v.id("resources") },
  returns: v.union(
    v.null(),
    v.object({ fileId: v.id("_storage"), name: v.string() }),
  ),
  handler: async (ctx, a) => {
    const resource = await ctx.db.get(a.resourceId);
    if (
      !resource ||
      resource.kind !== "file" ||
      !resource.fileId ||
      !(await allowed(ctx, resource))
    )
      return null;
    return { fileId: resource.fileId, name: resource.title };
  },
});
