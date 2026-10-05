import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { emailSource } from "./lib/emailValidators";
import { personalize } from "./lib/emailContent";
export const content = internalQuery({
  args: { source: emailSource },
  returns: v.union(
    v.null(),
    v.object({
      subject: v.string(),
      body: v.string(),
      eventName: v.string(),
      primary: v.string(),
      logo: v.union(v.string(), v.null()),
      unsubscribe: v.boolean(),
    }),
  ),
  handler: async (ctx, { source }) => {
    let eventId,
      subject,
      body,
      unsubscribe = false;
    if ("recipientId" in source) {
      const r = await ctx.db.get(source.recipientId);
      const c = r ? await ctx.db.get(r.campaignId) : null;
      if (!r || !c || r.status !== "queued") return null;
      const e = await ctx.db.get(c.eventId);
      if (!e) return null;
      const data = {
        name: r.name ?? "builder",
        teamName: r.teamName ?? "tu equipo",
        eventName: e.name,
      };
      eventId = e._id;
      subject = personalize(c.subject, data);
      body = personalize(c.bodyMarkdown, data, true);
      unsubscribe = c.category === "announcement";
    } else if ("mailId" in source) {
      const m = await ctx.db.get(source.mailId);
      if (!m) return null;
      eventId = m.eventId;
      subject = m.subject;
      body = m.body;
    } else if ("notificationId" in source) {
      const n = await ctx.db.get(source.notificationId);
      if (!n) return null;
      eventId = n.eventId;
      subject = n.subject;
      body = n.body;
    } else return null;
    const e = await ctx.db.get(eventId);
    if (!e) return null;
    return {
      subject,
      body,
      eventName: e.name,
      primary: e.theme.colors.primary,
      logo: e.theme.logoId ? await ctx.storage.getUrl(e.theme.logoId) : null,
      unsubscribe,
    };
  },
});
