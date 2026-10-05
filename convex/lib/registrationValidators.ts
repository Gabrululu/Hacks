import { v } from "convex/values";
import { field, answer } from "./validators";
export const registrationStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("waitlisted"),
  v.literal("checked_in"),
  v.literal("withdrawn"),
);
export const registrationView = v.object({
  id: v.id("registrations"),
  eventId: v.id("events"),
  status: registrationStatus,
  name: v.string(),
  email: v.string(),
  wallet: v.string(),
  formVersion: v.number(),
  fields: v.array(field),
  answers: v.record(v.string(), answer),
  consentText: v.string(),
  rulesText: v.string(),
  consentAt: v.number(),
  checkedInAt: v.union(v.number(), v.null()),
});
