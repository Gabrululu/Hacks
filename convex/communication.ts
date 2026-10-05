import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  eventQuery,
  eventMutation,
  authedQuery,
  authedMutation,
  superAdminMutation,
} from "./lib/functions";
import { can } from "./lib/permissions";
import { emailMode } from "./lib/emailConfig";
import { personalize } from "./lib/emailContent";
import { audience } from "./lib/validators";
import { validateMessage } from "./lib/emailContent";
import { campaignFor, start } from "./model/campaigns";
import { validateAudience, optedOut } from "./model/emailAudience";
import { emailLimiter, monthQuota } from "./lib/emailQuota";
import schema from "./schema";
import { internal } from "./_generated/api";
import { workflow } from "./communicationWorkflow";
import type { WorkflowId } from "@convex-dev/workflow";
export const campaigns = eventQuery("email.send")({
  args: {},
  returns: v.array(schema.doc("emailCampaigns")),
  handler: (ctx, a) =>
    ctx.db
      .query("emailCampaigns")
      .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
      .order("desc")
      .take(50),
});
export const save = eventMutation(
  "email.send",
  "email.draft",
)({
  args: {
    id: v.optional(v.id("emailCampaigns")),
    subject: v.string(),
    bodyMarkdown: v.string(),
    audience,
  },
  returns: v.id("emailCampaigns"),
  handler: async (ctx, a) => {
    const event = await ctx.db.get(a.eventId);
    if (!event || event.status === "archived")
      throw new ConvexError("EVENT_ARCHIVED");
    validateMessage(a.subject, a.bodyMarkdown);
    await validateAudience(ctx, a.eventId, ctx.user, a.audience);
    const data = {
      subject: a.subject.trim(),
      bodyMarkdown: a.bodyMarkdown.trim(),
      audience: a.audience,
    };
    if (a.id) {
      const c = await campaignFor(ctx, a.eventId, a.id);
      if (c.status !== "draft" || c.category !== "announcement")
        throw new ConvexError("CAMPAIGN_FROZEN");
      await ctx.db.patch(c._id, { ...data, authorId: ctx.user._id });
      return c._id;
    }
    return ctx.db.insert("emailCampaigns", {
      ...data,
      eventId: a.eventId,
      authorId: ctx.user._id,
      category: "announcement",
      status: "draft",
    });
  },
});
export const send = eventMutation(
  "email.send",
  "email.send",
)({
  args: { id: v.id("emailCampaigns"), scheduledAt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await campaignFor(ctx, a.eventId, a.id),
      event = await ctx.db.get(a.eventId);
    if (c.status !== "draft" || c.category !== "announcement")
      throw new ConvexError("CAMPAIGN_FROZEN");
    if (event?.status !== "published")
      throw new ConvexError("EVENT_NOT_PUBLISHED");
    await validateAudience(ctx, a.eventId, ctx.user, c.audience);
    const at = a.scheduledAt ?? Date.now();
    if (
      !Number.isFinite(at) ||
      at < Date.now() - 5000 ||
      at > Date.now() + 90 * 86400000
    )
      throw new ConvexError("INVALID_SCHEDULE");
    await ctx.db.patch(c._id, { authorId: ctx.user._id });
    await start(ctx, { ...c, authorId: ctx.user._id }, at);
    return null;
  },
});
export const test = eventMutation(
  "email.send",
  "email.test",
)({
  args: { id: v.id("emailCampaigns") },
  returns: v.id("emailRecipients"),
  handler: async (ctx, a) => {
    const c = await campaignFor(ctx, a.eventId, a.id);
    if (c.category !== "announcement" || c.status !== "draft")
      throw new ConvexError("CAMPAIGN_FROZEN");
    if (!ctx.user.email || !ctx.user.emailVerifiedAt)
      throw new ConvexError("EMAIL_NOT_VERIFIED");
    const attempts = await ctx.db
      .query("emailRecipients")
      .withIndex("by_campaignId_and_userId_and_isTest", (q) =>
        q.eq("campaignId", c._id).eq("userId", ctx.user._id).eq("isTest", true),
      )
      .order("desc")
      .take(5);
    if (attempts[0] && attempts[0]._creationTime > Date.now() - 60000)
      throw new ConvexError("TEST_RATE_LIMITED");
    const id = await ctx.db.insert("emailRecipients", {
      eventId: a.eventId,
      campaignId: c._id,
      userId: ctx.user._id,
      email: ctx.user.email.trim().toLowerCase(),
      name: ctx.user.name ?? "builder",
      isTest: true,
      status: "queued",
    });
    await ctx.scheduler.runAfter(0, internal.communicationEmails.deliver, {
      source: { recipientId: id },
    });
    return id;
  },
});
export const cancel = eventMutation(
  "email.send",
  "email.cancel",
)({
  args: { id: v.id("emailCampaigns") },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await campaignFor(ctx, a.eventId, a.id);
    if (!["preparing", "scheduled", "sending"].includes(c.status))
      throw new ConvexError("CAMPAIGN_FROZEN");
    await ctx.db.patch(c._id, { status: "cancelled" });
    if (c.workflowId) await workflow.cancel(ctx, c.workflowId as WorkflowId);
    return null;
  },
});
export const recipients = eventQuery("email.send")({
  args: { id: v.id("emailCampaigns"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("emailRecipients"),
        email: v.string(),
        name: v.optional(v.string()),
        isTest: v.optional(v.boolean()),
        status: v.string(),
        error: v.optional(v.string()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, a) => {
    const campaign = await campaignFor(ctx, a.eventId, a.id);
    const result = await ctx.db
      .query("emailRecipients")
      .withIndex("by_event_campaign", (q) =>
        q.eq("eventId", a.eventId).eq("campaignId", a.id),
      )
      .paginate(a.paginationOpts);
    const visible = await can(ctx, ctx.user, a.eventId, "registrations.view");
    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      page: result.page.map((r) => ({
        _id: r._id,
        email:
          visible || r.userId === ctx.user._id ? r.email : "Correo verificado",
        name: visible || r.userId === ctx.user._id ? r.name : "Destinatario",
        isTest: r.isTest,
        status:
          r.status === "queued" && campaign.status === "cancelled"
            ? "cancelled"
            : r.status,
        error: r.error,
      })),
    };
  },
});
export const quota = eventQuery(["email.send", "announcements.post"])({
  args: { now: v.number() },
  returns: v.object({
    limit: v.number(),
    remaining: v.number(),
    end: v.number(),
  }),
  handler: async (ctx, a) => {
    const event = await ctx.db.get(a.eventId);
    if (!event || !Number.isFinite(a.now))
      throw new ConvexError("EVENT_NOT_FOUND");
    const { key, config, end } = monthQuota(event, a.now);
    const value = await emailLimiter.getValue(ctx, "eventEmail", {
      key,
      config,
    });
    return { limit: config.rate, remaining: Math.max(0, value.value), end };
  },
});
export const setQuota = superAdminMutation({
  args: { eventId: v.id("events"), limit: v.number() },
  returns: v.null(),
  handler: async (ctx, a) => {
    if (
      !Number.isInteger(a.limit) ||
      a.limit < 1 ||
      a.limit > 100000 ||
      !(await ctx.db.get(a.eventId))
    )
      throw new ConvexError("INVALID_QUOTA");
    const event = (await ctx.db.get(a.eventId))!;
    const old = monthQuota(event, Date.now());
    const previous = await emailLimiter.getValue(ctx, "eventEmail", {
      key: old.key,
      config: old.config,
    });
    const used = Math.max(0, old.config.rate - previous.value);
    await emailLimiter.reset(ctx, "eventEmail", { key: old.key });
    const next = monthQuota(
      { ...event, emailMonthlyLimit: a.limit },
      Date.now(),
    );
    if (used)
      await emailLimiter.limit(ctx, "eventEmail", {
        key: next.key,
        config: { ...next.config, maxReserved: Math.max(used, a.limit) },
        count: used,
        reserve: true,
      });
    await ctx.db.patch(a.eventId, { emailMonthlyLimit: a.limit });
    return null;
  },
});
export const preference = authedQuery({
  args: { eventId: v.id("events") },
  returns: v.boolean(),
  handler: (ctx, a) => optedOut(ctx, a.eventId, ctx.user._id),
});
export const setPreference = authedMutation({
  args: { eventId: v.id("events"), optedOut: v.boolean() },
  returns: v.null(),
  handler: async (ctx, a) => {
    if (!(await ctx.db.get(a.eventId)))
      throw new ConvexError("EVENT_NOT_FOUND");
    const p = await ctx.db
      .query("eventEmailPreferences")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", a.eventId).eq("userId", ctx.user._id),
      )
      .unique();
    if (p) await ctx.db.patch(p._id, { optedOut: a.optedOut });
    else
      await ctx.db.insert("eventEmailPreferences", {
        ...a,
        userId: ctx.user._id,
      });
    return null;
  },
});
export const mailbox = authedQuery({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({ subject: v.string(), body: v.string(), status: v.string() }),
  ),
  handler: async (ctx, a) => {
    if (emailMode() !== "development") return [];
    const rows = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .take(100);
    const result = [];
    for (const d of rows) {
      if (d.eventId !== a.eventId || d.status !== "development") continue;
      if (d.mailId) {
        const m = await ctx.db.get(d.mailId);
        if (m?.visibleToRecipient)
          result.push({ subject: m.subject, body: m.body, status: d.status });
      }
      if (d.recipientId) {
        const r = await ctx.db.get(d.recipientId),
          c = r ? await ctx.db.get(r.campaignId) : null;
        if (c && r) {
          const event = await ctx.db.get(c.eventId);
          const data = {
            name: r.name ?? "builder",
            teamName: r.teamName ?? "tu equipo",
            eventName: event?.name ?? "Evento",
          };
          result.push({
            subject: r.developmentSubject ?? personalize(c.subject, data),
            body: r.developmentBody ?? personalize(c.bodyMarkdown, data, true),
            status: d.status,
          });
        }
      }
    }
    return result.slice(0, 30);
  },
});

export const retry = eventMutation(
  "email.send",
  "email.retry",
)({
  args: { id: v.id("emailCampaigns") },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await campaignFor(ctx, a.eventId, a.id);
    const event = await ctx.db.get(a.eventId);
    if (
      !c.audienceFrozen ||
      !["sent", "failed"].includes(c.status) ||
      event?.status !== "published"
    )
      throw new ConvexError("CAMPAIGN_FROZEN");
    await validateAudience(ctx, a.eventId, ctx.user, c.audience);
    await ctx.db.patch(c._id, {
      status: "sending",
      error: undefined,
      authorId: ctx.user._id,
    });
    const workflowId = await workflow.start(
      ctx,
      internal.communicationWorkflow.dispatch,
      { campaignId: c._id, at: Date.now(), retry: true },
    );
    await ctx.db.patch(c._id, { workflowId });
    return null;
  },
});
