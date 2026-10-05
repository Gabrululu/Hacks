import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  authedQuery,
  authedMutation,
  eventQuery,
  eventMutation,
} from "./lib/functions";
import { isEventOrganizer } from "./lib/permissions";
import { answer } from "./lib/validators";
import {
  registrationView,
  registrationStatus,
} from "./lib/registrationValidators";
import { visibleAnswers } from "./lib/formEngine";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import * as registrations from "./model/registrations";
async function view(
  ctx: QueryCtx,
  r: Doc<"registrations">,
  organizer: boolean,
) {
  const user = await ctx.db.get(r.userId),
    form = r.fieldSnapshot
      ? null
      : await ctx.db
          .query("forms")
          .withIndex("by_event_kind_and_version", (q) =>
            q
              .eq("eventId", r.eventId)
              .eq("kind", "registration")
              .eq("version", r.formVersion),
          )
          .unique();
  const data = visibleAnswers(
    r.fieldSnapshot ?? form?.fields ?? [],
    r.answers,
    organizer,
  );
  return {
    id: r._id,
    eventId: r.eventId,
    status: r.status,
    name: r.nameSnapshot ?? user?.name ?? "",
    email: r.emailSnapshot ?? user?.email ?? "",
    wallet: r.walletSnapshot ?? user?.wallet ?? "",
    formVersion: r.formVersion,
    ...data,
    consentText: r.consentText ?? "",
    rulesText: r.rulesText ?? "",
    consentAt: r.consentAt,
    checkedInAt: r.checkedInAt ?? null,
  };
}
export const mine = authedQuery({
  args: { slug: v.string() },
  returns: v.union(v.null(), registrationView),
  handler: async (ctx, a) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", a.slug))
      .unique();
    if (!event) return null;
    const r = await ctx.db
      .query("registrations")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", event._id).eq("userId", ctx.user._id),
      )
      .unique();
    return r ? view(ctx, r, true) : null;
  },
});
export const submit = authedMutation({
  args: {
    eventId: v.id("events"),
    formId: v.id("forms"),
    answers: v.record(v.string(), answer),
    rulesAccepted: v.boolean(),
    consentAccepted: v.boolean(),
    emailOptOut: v.boolean(),
  },
  returns: v.id("registrations"),
  handler: (ctx, a) =>
    registrations.submit(
      ctx,
      ctx.user,
      a.eventId,
      a.formId,
      a.answers,
      a.rulesAccepted,
      a.consentAccepted,
      a.emailOptOut,
    ),
});
export const withdraw = authedMutation({
  args: { id: v.id("registrations") },
  returns: v.null(),
  handler: (ctx, a) => registrations.withdraw(ctx, ctx.user, a.id),
});
export const list = eventQuery("registrations.view")({
  args: {
    status: v.optional(registrationStatus),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(registrationView),
  handler: async (ctx, a) => {
    const q = ctx.db
      .query("registrations")
      .withIndex("by_event_status", (q) =>
        a.status
          ? q.eq("eventId", a.eventId).eq("status", a.status)
          : q.eq("eventId", a.eventId),
      );
    const result = await q.paginate({
        ...a.paginationOpts,
        numItems: Math.min(a.paginationOpts.numItems, 25),
      }),
      organizer = await isEventOrganizer(ctx, ctx.user, a.eventId);
    return {
      ...result,
      page: await Promise.all(result.page.map((r) => view(ctx, r, organizer))),
    };
  },
});
export const review = eventMutation(
  "registrations.review",
  "registrations.batch_review",
)({
  args: {
    ids: v.array(v.id("registrations")),
    status: v.union(
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("waitlisted"),
    ),
  },
  returns: v.null(),
  handler: (ctx, a) =>
    registrations.review(ctx, ctx.user, a.eventId, a.ids, a.status),
});
export const exportPage = eventQuery("registrations.export")({
  args: {
    status: v.optional(registrationStatus),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(registrationView),
  handler: async (ctx, a) => {
    const result = await ctx.db
        .query("registrations")
        .withIndex("by_event_status", (q) =>
          a.status
            ? q.eq("eventId", a.eventId).eq("status", a.status)
            : q.eq("eventId", a.eventId),
        )
        .paginate({
          ...a.paginationOpts,
          numItems: Math.min(a.paginationOpts.numItems, 25),
        }),
      organizer = await isEventOrganizer(ctx, ctx.user, a.eventId);
    return {
      ...result,
      page: await Promise.all(result.page.map((r) => view(ctx, r, organizer))),
    };
  },
});
export const notifications = authedQuery({
  args: { slug: v.string() },
  returns: v.array(
    v.object({ subject: v.string(), body: v.string(), delivery: v.string() }),
  ),
  handler: async (ctx, a) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", a.slug))
      .unique();
    if (!event) return [];
    const all = await ctx.db
      .query("registrationNotifications")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", event._id).eq("userId", ctx.user._id),
      )
      .order("desc")
      .take(30);
    return all
      .filter((n) => n.eventId === event._id && n.delivery === "development")
      .map((n) => ({ subject: n.subject, body: n.body, delivery: n.delivery }));
  },
});

export const myEvents = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      id: v.id("registrations"),
      name: v.string(),
      slug: v.string(),
      status: registrationStatus,
    }),
  ),
  handler: async (ctx, a) => {
    const result = await ctx.db
      .query("registrations")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .paginate({
        ...a.paginationOpts,
        numItems: Math.min(a.paginationOpts.numItems, 25),
      });
    const page = await Promise.all(
      result.page.map(async (r) => {
        const event = await ctx.db.get(r.eventId);
        return event
          ? { id: r._id, name: event.name, slug: event.slug, status: r.status }
          : null;
      }),
    );
    return {
      ...result,
      page: page.filter((r): r is NonNullable<typeof r> => r !== null),
    };
  },
});
