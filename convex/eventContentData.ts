import { internalMutation } from "./lib/functions";
import { v } from "convex/values";
import * as events from "./model/events";
export const refreshPhase = internalMutation({
  args: { eventId: v.id("events"), revision: v.number() },
  returns: v.null(),
  handler: (ctx, args) => events.refreshPhase(ctx, args.eventId, args.revision),
});
