import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { editable, text } from "./contentShared";
import { requireAsset } from "./eventAssets";
export async function save(
  ctx: MutationCtx,
  eventId: Id<"events">,
  id: Id<"mentors"> | undefined,
  input: Pick<
    Doc<"mentors">,
    | "name"
    | "expertise"
    | "contact"
    | "availability"
    | "publicContact"
    | "photoId"
  >,
) {
  await editable(ctx, eventId);
  text(input.name, 2, 120);
  text(input.contact ?? "", 0, 200);
  text(input.availability ?? "", 0, 500);
  if (
    input.expertise.length > 8 ||
    input.expertise.some((s) => !s.trim() || s.length > 80)
  )
    throw new ConvexError("INVALID_EXPERTISE");
  if (input.photoId) await requireAsset(ctx, eventId, input.photoId, "image");
  if (id) {
    const old = await ctx.db.get(id);
    if (!old || old.eventId !== eventId) throw new ConvexError("NOT_FOUND");
    await ctx.db.patch(id, input);
    return id;
  }
  if (
    (
      await ctx.db
        .query("mentors")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(50)
    ).length >= 50
  )
    throw new ConvexError("CONTENT_LIMIT");
  return ctx.db.insert("mentors", { eventId, ...input });
}
export async function remove(
  ctx: MutationCtx,
  eventId: Id<"events">,
  id: Id<"mentors">,
) {
  await editable(ctx, eventId);
  const old = await ctx.db.get(id);
  if (!old || old.eventId !== eventId) throw new ConvexError("NOT_FOUND");
  if (
    (await ctx.db.query("mentorSlots")
      .withIndex("by_mentor_and_startsAt", (q) => q.eq("mentorId", id))
      .take(1)).length
  ) throw new ConvexError("MENTOR_HAS_SCHEDULE");
  await ctx.db.delete(id);
  return null;
}
