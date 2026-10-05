import { ConvexError, v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  authedMutation,
  authedQuery,
  eventQuery,
  publicQuery,
  internalMutation as wrappedInternalMutation,
} from "./lib/functions";
import { can, requireUser } from "./lib/permissions";
import { member } from "./lib/projectAccess";

const role = v.union(
  v.literal("participant"),
  v.literal("mentor"),
  v.literal("judge"),
);
const settingsValidator = v.object({
  enabled: v.boolean(),
  personalGalleryEnabled: v.boolean(),
  projectCardsEnabled: v.boolean(),
  templateId: v.string(),
  copyText: v.string(),
  officialName: v.optional(v.string()),
  officialLogoId: v.optional(v.id("_storage")),
  socialHandles: v.optional(
    v.object({ x: v.optional(v.string()), linkedin: v.optional(v.string()) }),
  ),
  projectLinks: v.object({
    repo: v.boolean(),
    demo: v.boolean(),
    video: v.boolean(),
  }),
});
const eventSlug = v.string();

async function getEventBySlug(ctx: QueryCtx | MutationCtx, slug: string) {
  return ctx.db
    .query("events")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

async function eligible(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  event: Doc<"events"> | null,
) {
  if (!event || event.status !== "published") return null;
  const registration = await ctx.db
    .query("registrations")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", event._id).eq("userId", user._id),
    )
    .unique();
  if (registration && ["approved", "checked_in"].includes(registration.status))
    return {
      role: "participant" as const,
      name: registration.nameSnapshot ?? user.name,
    };
  const staff = await ctx.db
    .query("eventStaff")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", event._id).eq("userId", user._id),
    )
    .take(8);
  const active = staff.find(
    (entry) =>
      entry.revokedAt === undefined &&
      ["mentor", "judge", "judge_lead"].includes(entry.role),
  );
  if (!active) return null;
  return {
    role: active.role === "mentor" ? ("mentor" as const) : ("judge" as const),
    name: user.name,
  };
}

function safeLink(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export const my = authedQuery({
  args: { slug: eventSlug },
  returns: v.union(
    v.null(),
    v.object({
      eventId: v.id("events"),
      role,
      displayName: v.string(),
      photoId: v.union(v.id("_storage"), v.null()),
      photoUrl: v.union(v.string(), v.null()),
      published: v.boolean(),
      settings: v.union(v.null(), settingsValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const event = await getEventBySlug(ctx, args.slug),
      status = await eligible(ctx, ctx.user, event);
    if (!event || !status) return null;
    const card = await ctx.db
      .query("personalEventCards")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", event._id).eq("userId", ctx.user._id),
      )
      .unique();
    return {
      eventId: event._id,
      role: status.role,
      displayName: card?.displayName ?? status.name ?? "",
      photoId: card?.photoId ?? null,
      photoUrl: card?.photoId
        ? `/personal-card-photo?slug=${encodeURIComponent(args.slug)}&userId=${ctx.user._id}`
        : null,
      published: card?.publishedAt !== undefined,
      settings: event.socialCards ?? null,
    };
  },
});

export const authorizePhotoUpload = internalQuery({
  args: { slug: eventSlug },
  returns: v.object({ eventId: v.id("events"), userId: v.id("users") }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      event = await getEventBySlug(ctx, args.slug);
    if (!(await eligible(ctx, user, event)) || !event?.socialCards?.enabled)
      throw new ConvexError("CARD_NOT_ELIGIBLE");
    return { eventId: event._id, userId: user._id };
  },
});

export const registerPhotoUpload = wrappedInternalMutation({
  args: { slug: eventSlug, fileId: v.id("_storage"), contentType: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      event = await getEventBySlug(ctx, args.slug),
      status = await eligible(ctx, user, event),
      metadata = await ctx.db.system.get(args.fileId);
    if (
      !event ||
      !status ||
      !event.socialCards?.enabled ||
      !metadata ||
      !metadata.size ||
      metadata.size > 5 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(args.contentType) ||
      (metadata.contentType !== undefined &&
        metadata.contentType !== args.contentType)
    )
      throw new ConvexError("INVALID_CARD_PHOTO");
    const existing = await ctx.db
      .query("personalCardUploads")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .unique();
    if (existing) throw new ConvexError("CARD_PHOTO_ALREADY_REGISTERED");
    await ctx.db.insert("personalCardUploads", {
      eventId: event._id,
      userId: user._id,
      fileId: args.fileId,
      contentType: args.contentType,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const saveMine = authedMutation({
  args: {
    slug: eventSlug,
    displayName: v.string(),
    photoId: v.union(v.id("_storage"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await getEventBySlug(ctx, args.slug),
      status = await eligible(ctx, ctx.user, event);
    if (!event || !status || !event.socialCards?.enabled)
      throw new ConvexError("CARD_NOT_ELIGIBLE");
    const displayName = args.displayName.trim();
    if (
      displayName.length < 2 ||
      displayName.length > 100 ||
      /[\x00-\x1f]/.test(displayName)
    )
      throw new ConvexError("INVALID_CARD_NAME");
    let photoId = args.photoId ?? undefined;
    if (photoId) {
      const metadata = await ctx.db.system.get(photoId),
        upload = await ctx.db
          .query("personalCardUploads")
          .withIndex("by_fileId", (q) => q.eq("fileId", photoId!))
          .unique();
      if (
        !metadata ||
        !upload ||
        upload.eventId !== event._id ||
        upload.userId !== ctx.user._id
      )
        throw new ConvexError("CARD_PHOTO_NOT_OWNED");
    }
    const prior = await ctx.db
      .query("personalEventCards")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", event._id).eq("userId", ctx.user._id),
      )
      .unique();
    if (prior) {
      const oldPhoto = prior.photoId;
      await ctx.db.patch(prior._id, {
        role: status.role,
        displayName,
        photoId,
        updatedAt: Date.now(),
      });
      if (oldPhoto && oldPhoto !== photoId)
        await removeOwnedPhotoIfUnreferenced(ctx, oldPhoto);
    } else
      await ctx.db.insert("personalEventCards", {
        eventId: event._id,
        userId: ctx.user._id,
        role: status.role,
        displayName,
        photoId,
        updatedAt: Date.now(),
      });
    return null;
  },
});

async function removeOwnedPhotoIfUnreferenced(
  ctx: MutationCtx,
  fileId: Doc<"personalCardUploads">["fileId"],
) {
  const projectUse = await ctx.db
    .query("projectUploads")
    .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
    .unique();
  const assetUse = await ctx.db
    .query("eventAssets")
    .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
    .unique();
  if (projectUse || assetUse) return;
  const upload = await ctx.db
    .query("personalCardUploads")
    .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
    .unique();
  if (!upload) return;
  const remainingUse = await ctx.db
    .query("personalEventCards")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", upload.eventId).eq("userId", upload.userId),
    )
    .unique();
  if (remainingUse?.photoId === fileId) return;
  await ctx.db.delete(upload._id);
  await ctx.storage.delete(fileId);
}

export const publishMine = authedMutation({
  args: { slug: eventSlug, publish: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await getEventBySlug(ctx, args.slug),
      status = await eligible(ctx, ctx.user, event);
    if (!event || !status) throw new ConvexError("CARD_NOT_ELIGIBLE");
    if (
      args.publish &&
      (!event.socialCards?.enabled || !event.socialCards.personalGalleryEnabled)
    )
      throw new ConvexError("PERSONAL_GALLERY_DISABLED");
    const card = await ctx.db
      .query("personalEventCards")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", event._id).eq("userId", ctx.user._id),
      )
      .unique();
    if (!card) throw new ConvexError("CARD_NOT_CREATED");
    await ctx.db.patch(card._id, {
      publishedAt: args.publish ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const configure = authedMutation({
  args: { eventId: v.id("events"), settings: settingsValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await can(ctx, ctx.user, args.eventId, "event.edit")))
      throw new ConvexError("FORBIDDEN");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new ConvexError("EVENT_NOT_FOUND");
    const s = args.settings;
    if (
      !s.templateId.trim() ||
      s.templateId.length > 80 ||
      s.copyText.length > 500 ||
      (s.officialName?.length ?? 0) > 100 ||
      [s.socialHandles?.x, s.socialHandles?.linkedin].some(
        (handle) =>
          (handle?.length ?? 0) > 80 || /[\x00-\x1f]/.test(handle ?? ""),
      )
    )
      throw new ConvexError("INVALID_CARD_SETTINGS");
    if (s.officialLogoId) {
      const asset = await ctx.db
        .query("eventAssets")
        .withIndex("by_fileId", (q) => q.eq("fileId", s.officialLogoId!))
        .unique();
      if (!asset || asset.eventId !== args.eventId || asset.kind !== "image")
        throw new ConvexError("INVALID_EVENT_LOGO");
    }
    await ctx.db.patch(args.eventId, { socialCards: s });
    return null;
  },
});

export const setProjectLogo = authedMutation({
  args: {
    submissionId: v.id("submissions"),
    logoId: v.union(v.id("_storage"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.submissionId);
    if (!project) throw new ConvexError("PROJECT_NOT_FOUND");
    const { team } = await member(ctx, ctx.user, project.teamId);
    if (team.eventId !== project.eventId) throw new ConvexError("FORBIDDEN");
    if (args.logoId) {
      if (!project.imageIds.includes(args.logoId))
        throw new ConvexError("PROJECT_LOGO_NOT_UPLOADED");
      const upload = await ctx.db
        .query("projectUploads")
        .withIndex("by_fileId", (q) => q.eq("fileId", args.logoId!))
        .unique();
      if (
        !upload ||
        upload.kind !== "image" ||
        upload.eventId !== project.eventId ||
        upload.teamId !== project.teamId
      )
        throw new ConvexError("PROJECT_LOGO_NOT_UPLOADED");
    }
    await ctx.db.patch(args.submissionId, {
      projectLogoId: args.logoId ?? undefined,
    });
    return null;
  },
});

function publicEventAllowed(event: Doc<"events"> | null) {
  return (
    !!event &&
    event.status === "published" &&
    event.settings.publicGallery &&
    event.resultsPublished &&
    event.socialCards?.enabled &&
    event.socialCards.projectCardsEnabled
  );
}

const projectCardValidator = v.object({
  id: v.id("submissions"),
  title: v.string(),
  summary: v.string(),
  team: v.string(),
  logoId: v.union(v.id("_storage"), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  repoUrl: v.union(v.string(), v.null()),
  demoUrl: v.union(v.string(), v.null()),
  videoUrl: v.union(v.string(), v.null()),
  copyText: v.string(),
  officialName: v.union(v.string(), v.null()),
  officialLogoId: v.union(v.id("_storage"), v.null()),
  officialLogoUrl: v.union(v.string(), v.null()),
  templateId: v.string(),
  socialHandles: v.object({
    x: v.union(v.string(), v.null()),
    linkedin: v.union(v.string(), v.null()),
  }),
});

async function projectCardData(
  ctx: QueryCtx,
  event: Doc<"events">,
  row: Doc<"submissions">,
  slug: string,
) {
  const team = await ctx.db.get(row.teamId);
  if (!team || team.active === false || team.mergedInto) return null;
  const s = event.socialCards!,
    logoId =
      row.projectLogoId && row.imageIds.includes(row.projectLogoId)
        ? row.projectLogoId
        : null;
  return {
    id: row._id,
    title: row.title,
    summary: row.summary,
    team: team.name,
    logoId,
    logoUrl: logoId ? `/project-card-logo?submissionId=${row._id}` : null,
    repoUrl: s.projectLinks.repo ? safeLink(row.repoUrl) : null,
    demoUrl: s.projectLinks.demo ? safeLink(row.demoUrl) : null,
    videoUrl: s.projectLinks.video ? safeLink(row.videoUrl) : null,
    copyText: s.copyText,
    officialName: s.officialName ?? null,
    officialLogoId: s.officialLogoId ?? event.theme.logoId ?? null,
    officialLogoUrl:
      s.officialLogoId || event.theme.logoId
        ? `/event-card-logo?slug=${encodeURIComponent(slug)}`
        : null,
    templateId: s.templateId,
    socialHandles: {
      x: s.socialHandles?.x ?? null,
      linkedin: s.socialHandles?.linkedin ?? null,
    },
  };
}

export const project = publicQuery({
  args: { slug: eventSlug, submissionId: v.id("submissions") },
  returns: v.union(v.null(), projectCardValidator),
  handler: async (ctx, args) => {
    const event = await getEventBySlug(ctx, args.slug),
      row = await ctx.db.get(args.submissionId);
    if (
      !event ||
      !row ||
      row.eventId !== event._id ||
      row.status !== "admitted" ||
      !publicEventAllowed(event)
    )
      return null;
    return projectCardData(ctx, event, row, args.slug);
  },
});

export const projectMine = authedQuery({
  args: { submissionId: v.id("submissions") },
  returns: v.union(v.null(), projectCardValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.submissionId);
    if (
      !row ||
      row.submittedAt === undefined ||
      !["submitted", "admitted"].includes(row.status)
    )
      return null;
    const { team, event } = await member(ctx, ctx.user, row.teamId);
    if (team.eventId !== row.eventId || !event.socialCards?.enabled)
      return null;
    return projectCardData(ctx, event, row, event.slug);
  },
});

export const personalGallery = publicQuery({
  args: { slug: eventSlug, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      userId: v.id("users"),
      role,
      displayName: v.string(),
      photoId: v.union(v.id("_storage"), v.null()),
      photoUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const event = await getEventBySlug(ctx, args.slug);
    if (
      !event ||
      event.status !== "published" ||
      !event.socialCards?.enabled ||
      !event.socialCards.personalGalleryEnabled
    )
      return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db
      .query("personalEventCards")
      .withIndex("by_event_and_publishedAt", (q) =>
        q.eq("eventId", event._id).gt("publishedAt", 0),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const mapped = await Promise.all(
      page.page.map(async (card) => ({
        userId: card.userId,
        role: card.role,
        displayName: card.displayName ?? "",
        photoId: card.photoId ?? null,
        photoUrl: card.photoId
          ? `/personal-card-photo?slug=${encodeURIComponent(args.slug)}&userId=${card.userId}`
          : null,
      })),
    );
    return { ...page, page: mapped };
  },
});

export const organizerSettings = eventQuery("event.edit")({
  args: {},
  returns: v.union(v.null(), settingsValidator),
  handler: async (ctx) => (await ctx.db.get(ctx.eventId))?.socialCards ?? null,
});

export const fileForPublicProject = internalQuery({
  args: { submissionId: v.id("submissions") },
  returns: v.union(v.id("_storage"), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.submissionId);
    const fileId = row?.projectLogoId;
    if (
      !row ||
      !fileId ||
      !row.imageIds.includes(fileId) ||
      !["submitted", "admitted"].includes(row.status)
    )
      return null;
    const event = await ctx.db.get(row.eventId),
      team = await ctx.db.get(row.teamId);
    if (
      !event?.socialCards?.enabled ||
      !team ||
      team.active === false ||
      team.mergedInto
    )
      return null;
    let publicAllowed = row.status === "admitted" && publicEventAllowed(event);
    if (!publicAllowed) {
      try {
        const user = await requireUser(ctx),
          membership = await ctx.db
            .query("teamMembers")
            .withIndex("by_event_user", (q) =>
              q.eq("eventId", row.eventId).eq("userId", user._id),
            )
            .unique();
        publicAllowed = membership?.teamId === row.teamId;
      } catch {
        publicAllowed = false;
      }
    }
    if (!publicAllowed) return null;
    const upload = await ctx.db
      .query("projectUploads")
      .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
      .unique();
    return upload?.kind === "image" &&
      upload.eventId === row.eventId &&
      upload.teamId === row.teamId &&
      (await ctx.db.system.get(fileId))
      ? fileId
      : null;
  },
});

export const fileForPersonalCard = internalQuery({
  args: { slug: v.string(), userId: v.id("users") },
  returns: v.union(v.id("_storage"), v.null()),
  handler: async (ctx, args) => {
    const event = await getEventBySlug(ctx, args.slug);
    const card = event
      ? await ctx.db
          .query("personalEventCards")
          .withIndex("by_event_user", (q) =>
            q.eq("eventId", event._id).eq("userId", args.userId),
          )
          .unique()
      : null;
    if (!event || !card?.photoId || !(await ctx.db.system.get(card.photoId)))
      return null;
    let owner = false;
    try {
      owner = (await requireUser(ctx))._id === card.userId;
    } catch {
      owner = false;
    }
    if (
      !owner &&
      (card.publishedAt === undefined ||
        event.status !== "published" ||
        !event.socialCards?.enabled ||
        !event.socialCards.personalGalleryEnabled)
    )
      return null;
    const upload = await ctx.db
      .query("personalCardUploads")
      .withIndex("by_fileId", (q) => q.eq("fileId", card.photoId!))
      .unique();
    return upload?.eventId === event._id && upload.userId === card.userId
      ? card.photoId
      : null;
  },
});

export const fileForOfficialLogo = internalQuery({
  args: { slug: v.string() },
  returns: v.union(v.id("_storage"), v.null()),
  handler: async (ctx, args) => {
    const event = await getEventBySlug(ctx, args.slug),
      fileId = event?.socialCards?.officialLogoId ?? event?.theme.logoId;
    if (
      !event ||
      event.status !== "published" ||
      !event.socialCards?.enabled ||
      !fileId
    )
      return null;
    const asset = await ctx.db
      .query("eventAssets")
      .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
      .unique();
    return asset?.eventId === event._id &&
      asset.kind === "image" &&
      (await ctx.db.system.get(fileId))
      ? fileId
      : null;
  },
});
