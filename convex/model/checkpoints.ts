import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { published } from "./forms";
import { DEFAULT_CHECKPOINT_FIELDS } from "../lib/projectValidation";
import { editable } from "./contentShared";
export async function save(
  ctx: MutationCtx,
  eventId: Id<"events">,
  id: Id<"checkpoints"> | undefined,
  title: string,
  description: string,
  dueAt: number,
  order: number,
  expectedRevision: number,
) {
  await editable(ctx, eventId);
  const event = (await ctx.db.get(eventId))!;
  if (
    !title.trim() ||
    title.length > 160 ||
    description.length > 5000 ||
    !Number.isInteger(dueAt) ||
    dueAt <= event.timeline.startsAt ||
    dueAt > event.timeline.submissionClosesAt ||
    !Number.isInteger(order) ||
    order < 0 ||
    order > 10000
  )
    throw new ConvexError("INVALID_CHECKPOINT");
  const current = id ? await ctx.db.get(id) : null;
  if (id && (!current || current.eventId !== eventId))
    throw new ConvexError("NOT_FOUND");
  if ((current?.revision ?? 0) !== expectedRevision)
    throw new ConvexError("PROJECT_CONFLICT");
  if (
    current &&
    (
      await ctx.db
        .query("checkpointSubmissions")
        .withIndex("by_event_checkpoint", (q) =>
          q.eq("eventId", eventId).eq("checkpointId", current._id),
        )
        .take(1)
    ).length
  )
    throw new ConvexError("CHECKPOINT_HAS_RESPONSES");
  if (
    !current &&
    (
      await ctx.db
        .query("checkpoints")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(52)
    ).length >= 52
  )
    throw new ConvexError("CHECKPOINT_LIMIT");
  const form = await published(ctx, eventId, "checkpoint"),
    input = {
      eventId,
      title: title.trim(),
      description: description.trim(),
      dueAt,
      order,
      revision: expectedRevision + 1,
      formId: form?._id,
      formVersion: form?.version ?? 0,
      fieldSnapshot: form?.fields ?? DEFAULT_CHECKPOINT_FIELDS,
    };
  if (current) {
    await ctx.db.patch(current._id, input);
    return current._id;
  }
  return ctx.db.insert("checkpoints", input);
}
export async function remove(
  ctx: MutationCtx,
  eventId: Id<"events">,
  id: Id<"checkpoints">,
) {
  await editable(ctx, eventId);
  const cp = await ctx.db.get(id);
  if (!cp || cp.eventId !== eventId) throw new ConvexError("NOT_FOUND");
  if (
    (
      await ctx.db
        .query("checkpointSubmissions")
        .withIndex("by_event_checkpoint", (q) =>
          q.eq("eventId", eventId).eq("checkpointId", id),
        )
        .take(1)
    ).length
  )
    throw new ConvexError("CHECKPOINT_HAS_RESPONSES");
  await ctx.db.delete(id);
  return null;
}
