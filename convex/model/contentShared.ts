import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
export async function editable(ctx: QueryCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError("NOT_FOUND");
  if (event.status === "archived") throw new ConvexError("EVENT_ARCHIVED");
}
export function text(value: string, min: number, max: number) {
  if (value.trim().length < min || value.length > max)
    throw new ConvexError("INVALID_CONTENT");
}
export function order(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 10000)
    throw new ConvexError("INVALID_ORDER");
}
