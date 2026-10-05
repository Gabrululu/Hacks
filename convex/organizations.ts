import { v, ConvexError } from "convex/values";
import { authedMutation, authedQuery } from "./lib/functions";
import { effectivePermissions } from "./lib/permissions";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

async function organizationOwner(ctx: MutationCtx & { user: Doc<"users"> }, organizationId: Id<"organizations">) {
  const member = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organization_and_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", ctx.user._id),
    )
    .first();
  if (!member || member.revokedAt !== undefined || member.role !== "owner")
    throw new ConvexError("FORBIDDEN");
}

export const mine = authedQuery({
  args: {},
  returns: v.array(v.object({
    id: v.id("organizations"), name: v.string(), slug: v.string(), role: v.string(),
    members: v.array(v.object({ id: v.id("users"), name: v.string(), wallet: v.string(), role: v.string() })),
    events: v.array(v.object({ id: v.id("events"), slug: v.string(), name: v.string() })),
  })),
  handler: async (ctx) => {
    const memberships = await ctx.db.query("organizationMembers")
      .withIndex("by_user_and_revokedAt", (q) => q.eq("userId", ctx.user._id).eq("revokedAt", undefined)).collect();
    return Promise.all(memberships.map(async (membership) => {
      const org = await ctx.db.get(membership.organizationId);
      if (!org) return null;
      const members = await ctx.db.query("organizationMembers")
        .withIndex("by_organization_and_user", (q) => q.eq("organizationId", org._id)).collect();
      const memberRows = await Promise.all(members.filter((m) => m.revokedAt === undefined).map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return user ? { id: user._id, name: user.name ?? "Builder", wallet: user.wallet, role: m.role } : null;
      }));
      const events = await ctx.db.query("events").withIndex("by_organization", (q) => q.eq("organizationId", org._id)).collect();
      return { id: org._id, name: org.name, slug: org.slug, role: membership.role,
        members: memberRows.filter((m): m is NonNullable<typeof m> => !!m),
        events: events.map((event) => ({ id: event._id, slug: event.slug, name: event.name })) };
    })).then((rows) => rows.filter((row): row is NonNullable<typeof row> => !!row));
  },
});

export const create = authedMutation({
  args: { name: v.string(), slug: v.string() },
  returns: v.id("organizations"),
  handler: async (ctx, args) => {
    if (ctx.user.platformRole === "user") throw new ConvexError("FORBIDDEN");
    const name = args.name.trim(), slug = args.slug.trim().toLowerCase();
    if (name.length < 2 || name.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80)
      throw new ConvexError("INVALID_ORGANIZATION");
    if (await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", slug)).unique())
      throw new ConvexError("ORGANIZATION_SLUG_TAKEN");
    const id = await ctx.db.insert("organizations", { name, slug, createdBy: ctx.user._id, createdAt: Date.now() });
    await ctx.db.insert("organizationMembers", { organizationId: id, userId: ctx.user._id, role: "owner", invitedBy: ctx.user._id, joinedAt: Date.now() });
    return id;
  },
});

export const addOrganizer = authedMutation({
  args: { organizationId: v.id("organizations"), wallet: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await organizationOwner(ctx, args.organizationId);
    const user = await ctx.db.query("users").withIndex("by_wallet", (q) => q.eq("wallet", args.wallet.trim())).unique();
    if (!user || user.platformRole === "user" || user.suspendedAt !== undefined) throw new ConvexError("ORGANIZER_NOT_FOUND");
    const existing = await ctx.db.query("organizationMembers").withIndex("by_organization_and_user", (q) => q.eq("organizationId", args.organizationId).eq("userId", user._id)).unique();
    if (existing?.revokedAt === undefined && existing) throw new ConvexError("ALREADY_MEMBER");
    if (existing) await ctx.db.patch(existing._id, { role: "organizer", invitedBy: ctx.user._id, joinedAt: Date.now(), revokedAt: undefined });
    else await ctx.db.insert("organizationMembers", { organizationId: args.organizationId, userId: user._id, role: "organizer", invitedBy: ctx.user._id, joinedAt: Date.now() });
    return null;
  },
});

export const removeOrganizer = authedMutation({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await organizationOwner(ctx, args.organizationId);
    if (args.userId === ctx.user._id) throw new ConvexError("CANNOT_REMOVE_SELF");
    const member = await ctx.db.query("organizationMembers").withIndex("by_organization_and_user", (q) => q.eq("organizationId", args.organizationId).eq("userId", args.userId)).unique();
    if (!member || member.revokedAt !== undefined || member.role === "owner") throw new ConvexError("NOT_FOUND");
    await ctx.db.patch(member._id, { revokedAt: Date.now() });
    return null;
  },
});

export const attachEvent = authedMutation({
  args: { organizationId: v.id("organizations"), slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await organizationOwner(ctx, args.organizationId);
    const event = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", args.slug.trim().toLowerCase())).unique();
    if (!event || !(await effectivePermissions(ctx, ctx.user, event._id)).includes("event.edit")) throw new ConvexError("FORBIDDEN");
    if (event.organizationId && event.organizationId !== args.organizationId) throw new ConvexError("EVENT_ALREADY_LINKED");
    await ctx.db.patch(event._id, { organizationId: args.organizationId });
    return null;
  },
});

export const detachEvent = authedMutation({
  args: { organizationId: v.id("organizations"), eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await organizationOwner(ctx, args.organizationId);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.organizationId !== args.organizationId) throw new ConvexError("NOT_FOUND");
    await ctx.db.patch(event._id, { organizationId: undefined });
    return null;
  },
});
