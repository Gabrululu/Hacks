import { v, ConvexError } from "convex/values";

import { eventMutation, eventQuery, publicQuery } from "./lib/functions";
import { requireUser } from "./lib/permissions";
import { emailLimiter } from "./lib/emailQuota";
import schema from "./schema";
const announcementView = v.object({
  id: v.id("announcements"),
  title: v.string(),
  body: v.string(),
  pinned: v.boolean(),
});
const scope = v.union(v.literal("all"), v.literal("participants"), v.literal("approved"), v.literal("judges"), v.literal("mentors"));
export const list = publicQuery({ args: { slug: v.string() }, returns: v.array(announcementView), handler: async (ctx, a) => {
  const event = await ctx.db.query("events").withIndex("by_slug", q => q.eq("slug", a.slug)).unique(); if (!event || event.status !== "published") return [];
  let user = null; if (await ctx.auth.getUserIdentity()) user = await requireUser(ctx);
  const registration = user ? await ctx.db.query("registrations").withIndex("by_event_user", q => q.eq("eventId", event._id).eq("userId", user._id)).unique() : null;
  const roles = user ? await ctx.db.query("eventStaff").withIndex("by_event_user", q => q.eq("eventId", event._id).eq("userId", user._id)).take(8) : [];
  const rows = await ctx.db.query("announcements").withIndex("by_event", q => q.eq("eventId", event._id)).order("desc").take(50);
  return rows
    .filter(n => n.audience === "all" || (n.audience === "participants" && registration && registration.status !== "withdrawn") || (n.audience === "approved" && registration && ["approved", "checked_in"].includes(registration.status)) || roles.some(r => r.revokedAt === undefined && ((n.audience === "judges" && ["judge", "judge_lead"].includes(r.role)) || (n.audience === "mentors" && r.role === "mentor"))))
    .sort((a,b) => Number(b.pinned)-Number(a.pinned))
    .map(({ _id, title, body, pinned }) => ({ id: _id, title, body, pinned }));
}});
export const manage = eventQuery("announcements.post")({ args: {}, returns: v.array(schema.doc("announcements")), handler: (ctx,a) => ctx.db.query("announcements").withIndex("by_event",q=>q.eq("eventId",a.eventId)).order("desc").take(50) });
export const post = eventMutation("announcements.post", "announcement.post")({ args: { title: v.string(), body: v.string(), audience: scope, pinned: v.boolean() }, returns: v.id("announcements"), handler: async (ctx,a) => {
  const event = await ctx.db.get(a.eventId); if (event?.status !== "published") throw new ConvexError("EVENT_NOT_PUBLISHED");
  if (!a.title.trim() || a.title.length>200 || !a.body.trim() || a.body.length>20000) throw new ConvexError("INVALID_MESSAGE");
  if (!(await emailLimiter.limit(ctx,"announcementPost",{key:a.eventId,config:{kind:"fixed window",rate:50,period:86400000,start:0}})).ok) throw new ConvexError("ANNOUNCEMENT_RATE_LIMITED");
  return ctx.db.insert("announcements", {...a,authorId:ctx.user._id});
}});
export const remove = eventMutation("announcements.post", "announcement.remove")({ args: { id: v.id("announcements") }, returns: v.null(), handler: async (ctx,a) => {
  const n=await ctx.db.get(a.id); if(!n||n.eventId!==a.eventId) throw new ConvexError("ANNOUNCEMENT_UNAVAILABLE"); await ctx.db.delete(n._id);return null;
}});
