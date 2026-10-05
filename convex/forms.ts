import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import schema from "./schema";
import { eventQuery, eventMutation, publicQuery } from "./lib/functions";
import { field } from "./lib/validators";
import * as forms from "./model/forms";
const kind = v.union(
  v.literal("registration"),
  v.literal("submission"),
  v.literal("checkpoint"),
  v.literal("feedback"),
);
export const editor = eventQuery("forms.edit")({
  args: { kind },
  returns: v.array(doc(schema, "forms")),
  handler: (ctx, a) => forms.versions(ctx, a.eventId, a.kind),
});
export const save = eventMutation(
  "forms.edit",
  "form.save",
)({
  args: {
    kind,
    expectedRevision: v.number(),
    fields: v.array(field),
    consentText: v.string(),
    rulesText: v.string(),
  },
  returns: v.id("forms"),
  handler: (ctx, a) =>
    forms.save(
      ctx,
      a.eventId,
      a.kind,
      a.expectedRevision,
      a.fields,
      a.consentText,
      a.rulesText,
    ),
});
export const publish = eventMutation(
  "forms.edit",
  "form.publish",
)({
  args: { id: v.id("forms"), expectedRevision: v.number() },
  returns: v.null(),
  handler: (ctx, a) => forms.publish(ctx, a.eventId, a.id, a.expectedRevision),
});
export const registration = publicQuery({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      eventId: v.id("events"),
      name: v.string(),
      slug: v.string(),
      registrationOpen: v.boolean(),
      form: v.union(v.null(), doc(schema, "forms")),
    }),
  ),
  handler: async (ctx, a) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", a.slug))
      .unique();
    if (event?.status !== "published") return null;
    return {
      eventId: event._id,
      name: event.name,
      slug: event.slug,
      registrationOpen: event.registrationOpen ?? false,
      form: await forms.published(ctx, event._id),
    };
  },
});
