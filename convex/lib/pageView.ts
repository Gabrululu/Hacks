import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { visibleBlock } from "./presentation";
export function resourceView(r: Doc<"resources">) {
  return {
    id: r._id,
    title: r.title,
    kind: r.kind,
    url: r.kind === "link" ? r.url : undefined,
    body: r.kind === "markdown" ? r.body : undefined,
    visibility: r.visibility,
    featuredFrom: r.featuredFrom,
  };
}
export async function getPage(
  ctx: QueryCtx,
  event: Doc<"events">,
  preview = false,
) {
  const blocks = preview
    ? event.blocks
    : event.blocks.filter((b) =>
        visibleBlock(b, event.publicPhase ?? "upcoming"),
      );
  const showJudges = preview || blocks.some((block) => block.type === "judges");
  const [tracks, mentors, resources, staff] = await Promise.all([
    ctx.db
      .query("tracks")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .take(50),
    ctx.db
      .query("mentors")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .take(50),
    ctx.db
      .query("resources")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .take(100),
    showJudges
      ? ctx.db
          .query("eventStaff")
          .withIndex("by_event_role", (q) =>
            q.eq("eventId", event._id).eq("role", "judge"),
          )
          .take(50)
      : Promise.resolve([] as Doc<"eventStaff">[]),
  ]);
  const ids = new Set<Id<"_storage">>();
  for (const id of [
    event.theme.logoId,
    event.theme.bannerId,
    event.theme.faviconId,
    event.theme.ogImageId,
  ])
    if (id) ids.add(id);
  for (const b of blocks)
    if (Array.isArray(b.content.imageIds))
      for (const raw of b.content.imageIds) {
        const id = ctx.db.system.normalizeId("_storage", raw);
        if (id) ids.add(id);
      }
  const images: Record<string, string> = {};
  await Promise.all(
    [...ids].map(async (id) => {
      const url = await ctx.storage.getUrl(id);
      if (url) images[id] = url;
    }),
  );
  const judges = await Promise.all(
    staff
      .filter((s) => s.revokedAt === undefined)
      .map(async (s) => {
        const u = await ctx.db.get(s.userId);
        return { name: u?.name ?? "Jurado", bio: u?.bio ?? "" };
      }),
  );
  return {
    publicGallery: event.settings.publicGallery && event.resultsPublished,
    slug: event.slug,
    name: event.name,
    tagline: event.tagline ?? "",
    description: event.description ?? "",
    status: event.status,
    timezone: event.timezone,
    phase: event.publicPhase ?? "upcoming",
    theme: event.theme,
    blocks,
    timeline: event.timeline,
    images,
    tracks: tracks
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t._id,
        name: t.name,
        description: t.description ?? "",
        prize: t.prize ?? "",
      })),
    mentors: await Promise.all(
      mentors.map(async (m) => ({
        name: m.name,
        expertise: m.expertise,
        contact: m.publicContact ? (m.contact ?? "") : "",
        availability: m.availability ?? "",
        photo: m.photoId ? await ctx.storage.getUrl(m.photoId) : null,
      })),
    ),
    judges,
    resources: resources
      .filter((r) => r.visibility === "public")
      .sort((a, b) => a.order - b.order)
      .map(resourceView),
  };
}
