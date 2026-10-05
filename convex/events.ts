import { v } from "convex/values";
import { pageView } from "./lib/contentValidators";
import { getPage } from "./lib/pageView";
import { publicQuery } from "./lib/functions";
export const list = publicQuery({
  args: {},
  returns: v.array(
    v.object({
      slug: v.string(),
      name: v.string(),
      tagline: v.string(),
      description: v.string(),
      type: v.string(),
      format: v.string(),
      location: v.string(),
      date: v.string(),
      prize: v.string(),
      tracks: v.array(v.string()),
      art: v.string(),
      open: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .take(100);
    return Promise.all(
      events.map(async (e) => {
        const tracks = await ctx.db
          .query("tracks")
          .withIndex("by_event", (q) => q.eq("eventId", e._id))
          .take(20);
        return {
          slug: e.slug,
          name: e.name,
          tagline: e.tagline ?? "",
          description: e.description ?? "",
          type: {
            hackathon: "Hackathon",
            buildathon: "Buildathon",
            ideathon: "Ideathon",
            bootcamp: "Bootcamp",
            demo_day: "Demo day",
            other: "Otro",
          }[e.type],
          format: { online: "Online", onsite: "Presencial", hybrid: "Híbrido" }[
            e.format
          ],
          location: e.location ?? "Online",
          date: new Intl.DateTimeFormat("es", {
            dateStyle: "medium",
            timeZone: e.timezone,
          }).format(e.timeline.startsAt),
          prize: e.prize ?? "",
          tracks: tracks.map((t) => t.name),
          art: e.art ?? "orbit",
          open: e.registrationOpen ?? false,
        };
      }),
    );
  },
});

export const get = publicQuery({
  args: { slug: v.string() },
  returns: v.union(v.null(), pageView),
  handler: async (ctx, a) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", a.slug))
      .unique();
    return event?.status === "published" ? getPage(ctx, event) : null;
  },
});

export const getByDomain = publicQuery({
  args: { domainSlug: v.string() },
  returns: v.union(v.null(), pageView),
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_domainSlug", (q) => q.eq("domainSlug", args.domainSlug.toLowerCase()))
      .unique();
    return event?.status === "published" ? getPage(ctx, event) : null;
  },
});
