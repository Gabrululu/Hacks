import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { emailSource, deliveryStatus } from "./lib/emailValidators";
import * as deliveries from "./model/emailDeliveries";
export const enqueue = internalMutation({
  args: {
    source: emailSource,
    verificationCode: v.optional(v.string()),
    html: v.optional(v.string()),
    unsubscribeHash: v.optional(v.string()),
    unsubscribeUrl: v.optional(v.string()),
  },
  returns: v.union(deliveryStatus, v.null()),
  handler: (ctx, a) =>
    deliveries.enqueue(
      ctx,
      a.source,
      a.verificationCode,
      a.html,
      a.unsubscribeHash,
      a.unsubscribeUrl,
    ),
});
export const suppressed = internalQuery({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: (ctx, a) => deliveries.suppressed(ctx, a.email),
});
