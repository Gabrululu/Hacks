import { v } from "convex/values";
import { vOnEmailEventArgs } from "@convex-dev/resend";
import { httpAction } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { resendClient } from "./lib/resend";
import { onEvent as recordEvent } from "./model/emailDeliveries";
export const onEvent = internalMutation({
  args: vOnEmailEventArgs.fields,
  returns: v.null(),
  handler: (ctx, a) => recordEvent(ctx, a.id, a.event),
});
export const webhook = httpAction(async (ctx, request) => {
  if (!process.env.RESEND_WEBHOOK_SECRET)
    return new Response("Webhook not configured", { status: 503 });
  try {
    return await resendClient().handleResendEventWebhook(ctx, request);
  } catch (error) {
    const invalid =
      error instanceof Error &&
      (error.name === "WebhookVerificationError" ||
        error instanceof SyntaxError);
    return new Response(
      invalid ? "Invalid webhook" : "Webhook processing failed",
      { status: invalid ? 400 : 500 },
    );
  }
});
