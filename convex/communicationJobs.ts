import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { allowed } from "./model/campaigns";
import { matches, memberData } from "./model/emailAudience";
const args = {
  campaignId: v.id("emailCampaigns"),
  cursor: v.union(v.string(), v.null()),
};
export const snapshot = internalMutation({
  args,
  returns: v.object({
    cursor: v.union(v.string(), v.null()),
    done: v.boolean(),
  }),
  handler: async (ctx, { campaignId, cursor }) => {
    const c = await ctx.db.get(campaignId);
    if (!c || c.status !== "preparing" || !(await allowed(ctx, c))) {
      if (c && c.status === "preparing")
        await ctx.db.patch(c._id, {
          status: "failed",
          error: "El evento o los permisos de envío ya no están disponibles.",
        });
      return { cursor: null, done: true };
    }
    const staffAudience = ["judges", "mentors"].includes(c.audience.kind);
    const page = staffAudience
      ? await ctx.db
          .query("eventStaff")
          .withIndex("by_event_and_revokedAt", (q) =>
            q.eq("eventId", c.eventId).eq("revokedAt", undefined),
          )
          .paginate({ cursor, numItems: 30 })
      : await ctx.db
          .query("registrations")
          .withIndex("by_event_user", (q) => q.eq("eventId", c.eventId))
          .paginate({ cursor, numItems: 30 });
    let added = 0;
    for (const row of page.page) {
      if (Math.floor(row._creationTime) > (c.frozenAt ?? 0)) continue;
      if (
        "role" in row &&
        !(
          (c.audience.kind === "judges" &&
            ["judge", "judge_lead"].includes(row.role)) ||
          (c.audience.kind === "mentors" && row.role === "mentor")
        )
      )
        continue;
      if ("answers" in row && !(await matches(ctx, c, row))) continue;
      const u = await ctx.db.get(row.userId);
      if (!u?.email || !u.emailVerifiedAt || u.suspendedAt !== undefined)
        continue;
      const exists = await ctx.db
        .query("emailRecipients")
        .withIndex("by_campaignId_and_userId_and_isTest", (q) =>
          q
            .eq("campaignId", campaignId)
            .eq("userId", u._id)
            .eq("isTest", false),
        )
        .first();
      if (exists) continue;
      const team = await memberData(ctx, c.eventId, u._id);
      await ctx.db.insert("emailRecipients", {
        eventId: c.eventId,
        campaignId,
        userId: u._id,
        email: u.email.trim().toLowerCase(),
        name: u.name ?? "builder",
        teamName: team?.name ?? "tu equipo",
        isTest: false,
        status: "queued",
      });
      added++;
    }
    if ((c.recipientCount ?? 0) + added > 5000) {
      await ctx.db.patch(c._id, {
        status: "failed",
        error:
          "La campaña supera los 5.000 destinatarios. Divide la audiencia en campañas más pequeñas.",
      });
      return { cursor: null, done: true };
    }
    await ctx.db.patch(c._id, {
      recipientCount: (c.recipientCount ?? 0) + added,
      ...(page.isDone
        ? { status: "scheduled" as const, audienceFrozen: true }
        : {}),
    });
    return { cursor: page.continueCursor, done: page.isDone };
  },
});
export const begin = internalMutation({
  args: { campaignId: v.id("emailCampaigns") },
  returns: v.null(),
  handler: async (ctx, { campaignId }) => {
    const c = await ctx.db.get(campaignId);
    if (c?.status === "scheduled")
      await ctx.db.patch(
        c._id,
        (await allowed(ctx, c))
          ? { status: "sending" }
          : {
              status: "failed",
              error: "Permisos de envío revocados o evento cerrado.",
            },
      );
    return null;
  },
});
export const batch = internalQuery({
  args: { ...args, retry: v.optional(v.boolean()) },
  returns: v.object({
    ids: v.array(v.id("emailRecipients")),
    cursor: v.union(v.string(), v.null()),
    done: v.boolean(),
  }),
  handler: async (ctx, { campaignId, cursor, retry }) => {
    const c = await ctx.db.get(campaignId);
    if (!c || c.status !== "sending" || !(await allowed(ctx, c)))
      return { ids: [], cursor: null, done: true };
    const p = await ctx.db
      .query("emailRecipients")
      .withIndex("by_event_campaign", (q) =>
        q.eq("eventId", c.eventId).eq("campaignId", campaignId),
      )
      .paginate({ cursor, numItems: 20 });
    return {
      ids: p.page
        .filter(
          (r) =>
            !r.isTest &&
            (r.status === "queued" ||
              (retry &&
                r.status === "failed" &&
                r.error === "MONTHLY_QUOTA_EXCEEDED")),
        )
        .map((r) => r._id),
      cursor: p.continueCursor,
      done: p.isDone,
    };
  },
});
export const finish = internalMutation({
  args: { campaignId: v.id("emailCampaigns"), failed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { campaignId, failed }) => {
    const c = await ctx.db.get(campaignId);
    if (c && !["failed", "cancelled", "sent"].includes(c.status))
      await ctx.db.patch(
        c._id,
        failed || !(await allowed(ctx, c))
          ? {
              status: "failed",
              error:
                "No se pudo completar la campaña. Los destinatarios ya procesados no se repetirán.",
            }
          : { status: "sent" },
      );
    return null;
  },
});

export const resetQuotaFailure = internalMutation({
  args: { recipientId: v.id("emailRecipients") },
  returns: v.null(),
  handler: async (ctx, { recipientId }) => {
    const r = await ctx.db.get(recipientId);
    if (!r || r.status !== "failed" || r.error !== "MONTHLY_QUOTA_EXCEEDED")
      return null;
    const c = await ctx.db.get(r.campaignId);
    if (!c || c.status !== "sending" || !(await allowed(ctx, c))) return null;
    const d = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_sourceKey", (q) => q.eq("sourceKey", r._id))
      .unique();
    if (d?.componentEmailId) return null;
    if (d) await ctx.db.delete(d._id);
    await ctx.db.patch(r._id, { status: "queued", error: undefined });
    return null;
  },
});
