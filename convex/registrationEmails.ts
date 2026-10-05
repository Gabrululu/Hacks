"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
export const deliver = internalAction({
  args: { id: v.id("registrationNotifications") },
  returns: v.null(),
  handler: async (ctx, a) => {
    try {
      const status = await ctx.runAction(internal.communicationEmails.deliver, {
        source: { notificationId: a.id },
      });
      if (status === "development")
        await ctx.runMutation(internal.registrationEmailData.markDelivery, {
          ...a,
          delivery: "development",
        });
      else if (!status || status === "suppressed" || status === "failed")
        await ctx.runMutation(internal.registrationEmailData.markDelivery, {
          ...a,
          delivery: "failed",
        });
    } catch {
      await ctx.runMutation(internal.registrationEmailData.markDelivery, {
        ...a,
        delivery: "failed",
      });
    }
    return null;
  },
});
