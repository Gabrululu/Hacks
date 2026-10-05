import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
export async function register(
  ctx: MutationCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
  formId: Id<"forms">,
  fieldId: string,
  fileId: Id<"_storage">,
  name: string,
) {
  const existing = await ctx.db
    .query("registrationUploads")
    .withIndex("by_eventId_and_userId", (q) =>
      q.eq("eventId", eventId).eq("userId", userId),
    )
    .take(100);
  if (existing.length >= 100) throw new ConvexError("UPLOAD_LIMIT");
  await ctx.db.insert("registrationUploads", {
    eventId,
    userId,
    formId,
    fieldId,
    fileId,
    name: name.slice(0, 150),
  });
  return null;
}
