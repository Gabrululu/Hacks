import { v } from "convex/values";
import { eventMutation } from "./lib/functions";
import * as events from "./model/events";

export const setSubdomain = eventMutation("event.edit", "event.domain.update")({
  args: { domainSlug: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) =>
    events.updateDomain(ctx, args.eventId, args.domainSlug),
});
