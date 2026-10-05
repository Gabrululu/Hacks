import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { editable, text, order } from "./contentShared";
export async function save(
  ctx: MutationCtx,
  eventId: Id<"events">,
  id: Id<"tracks"> | undefined,
  input: Pick<Doc<"tracks">, "name" | "description" | "prize" | "order">,
) {
  await editable(ctx, eventId);
  text(input.name, 2, 120);
  text(input.description ?? "", 0, 5000);
  text(input.prize ?? "", 0, 300);
  order(input.order);
  if (id) {
    const old = await ctx.db.get(id);
    if (!old || old.eventId !== eventId) throw new ConvexError("NOT_FOUND");
    await ctx.db.patch(id, input);
    return id;
  }
  if (
    (
      await ctx.db
        .query("tracks")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(50)
    ).length >= 50
  )
    throw new ConvexError("CONTENT_LIMIT");
  return ctx.db.insert("tracks", {
    eventId,
    ...input,
    name: input.name.trim(),
  });
}
export async function remove(
  ctx: MutationCtx,
  eventId: Id<"events">,
  id: Id<"tracks">,
) {
  await editable(ctx, eventId);
  const old = await ctx.db.get(id);
  if (!old || old.eventId !== eventId) throw new ConvexError("NOT_FOUND");
  // Later submission phases may reference these IDs: preserve them once entries exist.
  const submissions = await ctx.db
    .query("submissions")
    .withIndex("by_event_status", (q) => q.eq("eventId", eventId))
    .take(1);
  if (submissions.length) throw new ConvexError("TRACK_IN_USE");
  await ctx.db.delete(id);
  return null;
}
