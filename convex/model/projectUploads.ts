import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
export async function register(
  ctx: MutationCtx,
  input: Omit<Doc<"projectUploads">, "_id" | "_creationTime">,
) {
  const uploads = await ctx.db
    .query("projectUploads")
    .withIndex("by_eventId_and_teamId", (q) =>
      q.eq("eventId", input.eventId).eq("teamId", input.teamId),
    )
    .take(200);
  if (uploads.length >= 200) throw new ConvexError("UPLOAD_LIMIT");
  await ctx.db.insert("projectUploads", input);
  return null;
}
export async function moveUploads(
  ctx: MutationCtx,
  eventId: Id<"events">,
  source: Id<"teams">,
  target: Id<"teams">,
) {
  const a = await ctx.db
      .query("projectUploads")
      .withIndex("by_eventId_and_teamId", (q) =>
        q.eq("eventId", eventId).eq("teamId", source),
      )
      .take(201),
    b = await ctx.db
      .query("projectUploads")
      .withIndex("by_eventId_and_teamId", (q) =>
        q.eq("eventId", eventId).eq("teamId", target),
      )
      .take(201);
  if (a.length + b.length > 200) throw new ConvexError("UPLOAD_LIMIT");
  for (const row of a) await ctx.db.patch(row._id, { teamId: target });
}
