import { v } from "convex/values";
export const deliveryStatus = v.union(
  v.literal("queued"),
  v.literal("skipped"),
  v.literal("cancelled"),
  v.literal("development"),
  v.literal("sent"),
  v.literal("delivery_delayed"),
  v.literal("delivered"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("failed"),
  v.literal("suppressed"),
);
export const emailSource = v.union(
  v.object({ verificationId: v.id("emailVerifications") }),
  v.object({ notificationId: v.id("registrationNotifications") }),
  v.object({ recipientId: v.id("emailRecipients") }),
  v.object({ mailId: v.id("eventMail") }),
);
