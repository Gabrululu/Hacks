import { internal } from "../_generated/api";
import { requireAsset } from "./eventAssets";
import { validateTheme, validateBlocks, phaseAt } from "../lib/presentation";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  DEFAULT_THEME,
  TEMPLATE_DESCRIPTIONS,
  templateSettings,
} from "../lib/eventTemplates";
import { addOwner } from "./eventStaff";
import { writeAudit } from "./auditLog";
export type EventInput = Pick<
  Doc<"events">,
  "name" | "format" | "timezone" | "timeline" | "settings"
> & { tagline: string; description: string; location: string };
export function validateEvent(input: EventInput) {
  if (
    input.name.trim().length < 3 ||
    input.name.length > 120 ||
    input.tagline.length > 180 ||
    input.description.length > 10000 ||
    input.location.length > 200
  )
    throw new ConvexError("INVALID_EVENT");
  try {
    new Intl.DateTimeFormat("es", { timeZone: input.timezone });
  } catch {
    throw new ConvexError("INVALID_TIMEZONE");
  }
  const t = input.timeline;
  const times = [
    t.registrationOpensAt,
    t.registrationClosesAt,
    t.startsAt,
    t.submissionOpensAt,
    t.submissionClosesAt,
    t.judgingClosesAt,
  ];
  if (
    times.some(
      (n) =>
        !Number.isFinite(n) ||
        !Number.isInteger(n) ||
        n < 0 ||
        n > 8640000000000000,
    ) ||
    t.registrationClosesAt <= t.registrationOpensAt ||
    t.startsAt < t.registrationOpensAt ||
    t.registrationClosesAt > t.submissionClosesAt ||
    t.submissionOpensAt < t.startsAt ||
    t.submissionClosesAt <= t.submissionOpensAt ||
    t.judgingClosesAt < t.submissionClosesAt ||
    (t.resultsAt !== undefined &&
      (!Number.isInteger(t.resultsAt) ||
        t.resultsAt < t.judgingClosesAt ||
        t.resultsAt > 8640000000000000))
  )
    throw new ConvexError("INVALID_TIMELINE");
  const s = input.settings;
  if (
    !Number.isInteger(s.teamSizeMin) ||
    !Number.isInteger(s.teamSizeMax) ||
    s.teamSizeMin < 1 ||
    s.teamSizeMax > 20 ||
    s.teamSizeMin > s.teamSizeMax ||
    !Number.isInteger(s.requiredCheckpoints) ||
    s.requiredCheckpoints < 0 ||
    s.requiredCheckpoints > 52 ||
    !Number.isInteger(s.judgesPerSubmission) ||
    s.judgesPerSubmission < 1 ||
    s.judgesPerSubmission > 10 ||
    (s.capacity !== undefined &&
      (!Number.isInteger(s.capacity) ||
        s.capacity < 1 ||
        s.capacity > 100000)) ||
    (s.admission === "capped" && s.capacity === undefined)
  )
    throw new ConvexError("INVALID_SETTINGS");
  if (input.format !== "online" && !input.location.trim())
    throw new ConvexError("LOCATION_REQUIRED");
}
export async function create(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    name: string;
    slug: string;
    type: Doc<"events">["type"];
    timezone: string;
  },
) {
  if (user.platformRole !== "organizer" && user.platformRole !== "superadmin")
    throw new ConvexError("FORBIDDEN");
  if (!user.name || !user.emailVerifiedAt)
    throw new ConvexError("PROFILE_INCOMPLETE");
  const slug = args.slug.trim().toLowerCase();
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    slug.length < 3 ||
    slug.length > 80
  )
    throw new ConvexError("INVALID_SLUG");
  if (
    await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique()
  )
    throw new ConvexError("SLUG_TAKEN");
  const limit = user.eventLimit ?? 3;
  if (user.platformRole !== "superadmin") {
    const drafts = await ctx.db
      .query("events")
      .withIndex("by_owner_and_status", (q) =>
        q.eq("ownerId", user._id).eq("status", "draft"),
      )
      .take(limit);
    const published = await ctx.db
      .query("events")
      .withIndex("by_owner_and_status", (q) =>
        q.eq("ownerId", user._id).eq("status", "published"),
      )
      .take(limit);
    const suspended = await ctx.db
      .query("events")
      .withIndex("by_owner_and_status", (q) =>
        q.eq("ownerId", user._id).eq("status", "suspended"),
      )
      .take(limit);
    if (drafts.length + published.length + suspended.length >= limit)
      throw new ConvexError("EVENT_QUOTA_REACHED");
  }
  const day = 86400000,
    now = Math.floor(Date.now() / 60000) * 60000;
  const input: EventInput = {
    name: args.name.trim(),
    timezone: args.timezone,
    format: "online",
    tagline: "",
    description: TEMPLATE_DESCRIPTIONS[args.type],
    location: "",
    timeline: {
      registrationOpensAt: now,
      registrationClosesAt: now + 14 * day,
      startsAt: now + 15 * day,
      submissionOpensAt: now + 15 * day,
      submissionClosesAt: now + (args.type === "buildathon" ? 43 : 17) * day,
      judgingClosesAt: now + (args.type === "buildathon" ? 46 : 20) * day,
      resultsAt: now + (args.type === "buildathon" ? 47 : 21) * day,
    },
    settings: templateSettings(args.type),
  };
  validateEvent(input);
  const id = await ctx.db.insert("events", {
    ...input,
    slug,
    ownerId: user._id,
    type: args.type,
    status: "draft",
    theme: DEFAULT_THEME,
    blocks: [
      {
        id: "hero",
        type: "hero",
        visible: true,
        content: { title: input.name },
      },
      {
        id: "about",
        type: "about",
        visible: true,
        content: { markdown: input.description },
      },
      { id: "timeline", type: "timeline", visible: true, content: {} },
    ],
    judgingClosed: false,
    resultsPublished: false,
  });
  await addOwner(ctx, id, user._id);
  await writeAudit(ctx, user._id, "event.create", id);
  return id;
}
export async function update(
  ctx: MutationCtx,
  eventId: Id<"events">,
  input: EventInput,
) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError("NOT_FOUND");
  if (event.status === "archived") throw new ConvexError("EVENT_ARCHIVED");
  validateEvent(input);
  if (
    event.judgingStartedAt !== undefined &&
    (Object.keys({ ...event.timeline, ...input.timeline }).some(
      (key) =>
        input.timeline[key as keyof typeof input.timeline] !==
        event.timeline[key as keyof typeof event.timeline],
    ) ||
      Object.keys({ ...event.settings, ...input.settings }).some(
        (key) =>
          key !== "publicGallery" &&
          input.settings[key as keyof typeof input.settings] !==
            event.settings[key as keyof typeof event.settings],
      ))
  )
    throw new ConvexError("JUDGING_STARTED");
  await ctx.db.patch(eventId, {
    ...input,
    name: input.name.trim(),
    location: input.location.trim(),
  });
  await refreshPhase(ctx, eventId);
  return null;
}

const RESERVED_EVENT_DOMAINS = new Set([
  "admin", "api", "app", "assets", "auth", "dashboard", "help", "hacks",
  "mail", "manage", "organize", "organizar", "status", "support", "www",
]);

export async function updateDomain(
  ctx: MutationCtx,
  eventId: Id<"events">,
  value: string | null,
) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError("NOT_FOUND");
  const domainSlug = value?.trim().toLowerCase() || undefined;
  if (event.status === "archived" && domainSlug)
    throw new ConvexError("EVENT_ARCHIVED");
  if (domainSlug) {
    if (
      domainSlug.length < 3 ||
      domainSlug.length > 20 ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(domainSlug) ||
      domainSlug.includes("--")
    )
      throw new ConvexError("INVALID_DOMAIN_SLUG");
    if (RESERVED_EVENT_DOMAINS.has(domainSlug))
      throw new ConvexError("RESERVED_DOMAIN_SLUG");
    const existing = await ctx.db
      .query("events")
      .withIndex("by_domainSlug", (q) => q.eq("domainSlug", domainSlug))
      .unique();
    if (existing && existing._id !== eventId)
      throw new ConvexError("EVENT_DOMAIN_TAKEN");
  }
  await ctx.db.patch(eventId, { domainSlug });
  return null;
}

export async function savePresentation(
  ctx: MutationCtx,
  eventId: Id<"events">,
  expectedVersion: number,
  value: { theme?: Doc<"events">["theme"]; blocks?: Doc<"events">["blocks"] },
) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError("NOT_FOUND");
  if (event.status === "archived") throw new ConvexError("EVENT_ARCHIVED");
  if ((event.presentationVersion ?? 0) !== expectedVersion)
    throw new ConvexError("PRESENTATION_CONFLICT");
  if (value.theme) {
    validateTheme(value.theme);
    for (const id of [
      value.theme.logoId,
      value.theme.bannerId,
      value.theme.faviconId,
      value.theme.ogImageId,
    ])
      if (id) await requireAsset(ctx, eventId, id, "image");
  }
  if (value.blocks) {
    validateBlocks(value.blocks);
    for (const b of value.blocks) {
      const ids = b.content.imageIds;
      if (Array.isArray(ids))
        for (const raw of ids) {
          const id = ctx.db.system.normalizeId("_storage", raw);
          if (!id) throw new ConvexError("INVALID_ASSET");
          await requireAsset(ctx, eventId, id, "image");
        }
    }
  }
  await ctx.db.patch(eventId, {
    ...value,
    presentationVersion: expectedVersion + 1,
  });
  return null;
}
export async function refreshPhase(
  ctx: MutationCtx,
  eventId: Id<"events">,
  revision?: number,
) {
  const event = await ctx.db.get(eventId);
  if (!event || (revision !== undefined && revision !== event.phaseRevision))
    return null;
  const now = Date.now(),
    phaseRevision = revision ?? (event.phaseRevision ?? 0) + 1;
  await ctx.db.patch(eventId, {
    publicPhase:
      event.resultsPublished && event.status === "published"
        ? "results"
        : phaseAt(event, now),
    registrationOpen:
      event.status === "published" &&
      now >= event.timeline.registrationOpensAt &&
      now < event.timeline.registrationClosesAt,
    phaseRevision,
  });
  if (event.status === "published") {
    const next = Object.values(event.timeline)
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0];
    if (next !== undefined)
      await ctx.scheduler.runAt(next, internal.eventContentData.refreshPhase, {
        eventId,
        revision: phaseRevision,
      });
  }
  return null;
}
export async function changeStatus(
  ctx: MutationCtx,
  eventId: Id<"events">,
  status: Doc<"events">["status"],
) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError("NOT_FOUND");
  if (event.status === "suspended") throw new ConvexError("EVENT_SUSPENDED");
  if (event.status === "archived" && status === "published")
    throw new ConvexError("RESTORE_DRAFT_FIRST");
  if (event.status === "archived" && status === "draft") {
    const owner = await ctx.db.get(event.ownerId);
    if (!owner) throw new ConvexError("NOT_FOUND");
    if (owner.platformRole !== "superadmin") {
      const limit = owner.eventLimit ?? 3;
      const a = await ctx.db
        .query("events")
        .withIndex("by_owner_and_status", (q) =>
          q.eq("ownerId", owner._id).eq("status", "draft"),
        )
        .take(limit);
      const b = await ctx.db
        .query("events")
        .withIndex("by_owner_and_status", (q) =>
          q.eq("ownerId", owner._id).eq("status", "published"),
        )
        .take(limit);
      if (a.length + b.length >= limit)
        throw new ConvexError("EVENT_QUOTA_REACHED");
    }
  }
  if (status === "published") {
    validateTheme(event.theme);
    validateBlocks(event.blocks);
    validateEvent({
      ...event,
      tagline: event.tagline ?? "",
      description: event.description ?? "",
      location: event.location ?? "",
    });
    if (
      !event.blocks.some(
        (b) =>
          b.type === "hero" &&
          b.visible &&
          (!b.visibleFrom || b.visibleFrom === "upcoming"),
      )
    )
      throw new ConvexError("VISIBLE_HERO_REQUIRED");
  }
  await ctx.db.patch(eventId, { status });
  await refreshPhase(ctx, eventId);
  return null;
}
