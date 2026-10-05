"use node";
import { randomBytes, createHash } from "node:crypto";
import { createElement } from "react";
import { render } from "@react-email/render";
import { v, type Infer } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { emailSource, deliveryStatus } from "./lib/emailValidators";
import { EventEmail } from "./emails/templates/EventEmail";
import { appUrl } from "./lib/emailContent";
async function deliverMessage(
  ctx: ActionCtx,
  source: Infer<typeof emailSource>,
): Promise<
  import("./_generated/dataModel").Doc<"emailDeliveries">["status"] | null
> {
  const content = await ctx.runQuery(internal.communicationEmailData.content, {
    source,
  });
  if (!content) return null;
  const token = content.unsubscribe
    ? randomBytes(32).toString("hex")
    : undefined;
  const unsubscribeHash = token
    ? createHash("sha256").update(token).digest("hex")
    : undefined;
  const unsubscribeUrl = token ? `${appUrl()}/unsubscribe/${token}` : undefined;
  const html = await render(
    createElement(EventEmail, {
      ...content,
      unsubscribeUrl: token ? `${appUrl()}/unsubscribe/${token}` : undefined,
    }),
  );
  return ctx.runMutation(internal.emailDelivery.enqueue, {
    source,
    html,
    unsubscribeHash,
    unsubscribeUrl,
  });
}
export const deliver = internalAction({
  args: { source: emailSource },
  returns: v.union(deliveryStatus, v.null()),
  handler: (ctx, { source }) => deliverMessage(ctx, source),
});
export const deliverBatch = internalAction({
  args: { ids: v.array(v.id("emailRecipients")), retry: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { ids, retry }) => {
    if (ids.length > 20) throw new Error("EMAIL_BATCH_TOO_LARGE");
    for (const recipientId of ids) {
      if (retry)
        await ctx.runMutation(internal.communicationJobs.resetQuotaFailure, {
          recipientId,
        });
      await deliverMessage(ctx, { recipientId });
    }
    return null;
  },
});
