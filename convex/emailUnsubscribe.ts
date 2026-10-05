"use node";
import { createHash } from "node:crypto";
import { v, ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
export const unsubscribe = action({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, { token }): Promise<null> => {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new ConvexError("INVALID_UNSUBSCRIBE");
    return ctx.runMutation(internal.emailUnsubscribeData.apply, {
      hash: createHash("sha256").update(token).digest("hex"),
    });
  },
});
