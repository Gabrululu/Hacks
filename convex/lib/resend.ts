import { Resend } from "@convex-dev/resend";
import { components, internal } from "../_generated/api";
// Every enqueue uses the same callback and the official component queue.
export function resendClient(): Resend {
  return new Resend(components.resend, {
    testMode: false,
    onEmailEvent: internal.emailWebhook.onEvent,
  });
}
