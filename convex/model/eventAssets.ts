import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
export async function requireAsset(
  ctx: QueryCtx,
  eventId: Id<"events">,
  fileId: Id<"_storage">,
  kind: "image" | "resource",
) {
  const asset = await ctx.db
    .query("eventAssets")
    .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
    .unique();
  if (
    !asset ||
    asset.eventId !== eventId ||
    asset.kind !== kind ||
    !(await ctx.db.system.get(fileId))
  )
    throw new ConvexError("INVALID_ASSET");
}
export async function register(
  ctx: MutationCtx,
  eventId: Id<"events">,
  fileId: Id<"_storage">,
  kind: "image" | "resource",
  name: string,
  createdBy: Id<"users">,
  contentType: string,
) {
  const event = await ctx.db.get(eventId);
  if (!event || event.status === "archived")
    throw new ConvexError("EVENT_ARCHIVED");
  if (
    (
      await ctx.db
        .query("eventAssets")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(100)
    ).length >= 100
  )
    throw new ConvexError("ASSET_LIMIT");
  const meta = await ctx.db.system.get(fileId);
  const accepted =
    kind === "image"
      ? ["image/png", "image/jpeg", "image/webp"]
      : ["application/pdf", "text/plain", "application/zip"];
  if (
    !meta ||
    meta.size > (kind === "image" ? 5 : 10) * 1024 * 1024 ||
    !accepted.includes(contentType) ||
    (meta.contentType !== undefined && meta.contentType !== contentType)
  )
    throw new ConvexError("INVALID_FILE");
  await ctx.db.insert("eventAssets", {
    eventId,
    fileId,
    kind,
    name: name.slice(0, 150),
    createdBy,
  });
  return null;
}
