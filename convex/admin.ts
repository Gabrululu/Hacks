import { v, ConvexError } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { superAdminQuery, superAdminMutation } from "./lib/functions";
import { writeAudit } from "./model/auditLog";
import { refreshPhase } from "./model/events";
const userView = v.object({
  id: v.id("users"),
  name: v.string(),
  wallet: v.string(),
  role: v.string(),
  eventLimit: v.number(),
  suspended: v.boolean(),
});
export const users = superAdminQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(userView),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("users")
      .withIndex("by_creation_time")
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((u) => ({
        id: u._id,
        name: u.name ?? "Sin nombre",
        wallet: u.wallet,
        role: u.platformRole,
        eventLimit: u.eventLimit ?? 3,
        suspended: u.suspendedAt !== undefined,
      })),
    };
  },
});
export const suspendUser = superAdminMutation({
  args: { userId: v.id("users"), suspended: v.boolean(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.userId);
    if (!target) throw new ConvexError("NOT_FOUND");
    if (target.platformRole === "superadmin")
      throw new ConvexError("PROTECTED_USER");
    const reason = args.reason.trim();
    if (reason.length < 3 || reason.length > 1000)
      throw new ConvexError("REASON_REQUIRED");
    if (args.suspended === (target.suspendedAt !== undefined)) return null;
    await ctx.db.patch(target._id, {
      suspendedAt: args.suspended ? Date.now() : undefined,
      suspensionReason: args.suspended ? reason : undefined,
      sessionVersion: (target.sessionVersion ?? 0) + 1,
    });
    await writeAudit(
      ctx,
      ctx.user._id,
      args.suspended ? "admin.user.suspend" : "admin.user.restore",
      undefined,
      { targetTable: "users", targetId: target._id, data: { reason } },
    );
    return null;
  },
});
export const suspendEvent = superAdminMutation({
  args: { eventId: v.id("events"), suspended: v.boolean(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new ConvexError("NOT_FOUND");
    const reason = args.reason.trim();
    if (reason.length < 3 || reason.length > 1000)
      throw new ConvexError("REASON_REQUIRED");
    if (args.suspended === (event.status === "suspended")) return null;
    await ctx.db.patch(
      event._id,
      args.suspended
        ? {
            status: "suspended",
            statusBeforeSuspension:
              event.status === "suspended" ? undefined : event.status,
            suspendedAt: Date.now(),
            suspensionReason: reason,
          }
        : {
            status: event.statusBeforeSuspension ?? "draft",
            statusBeforeSuspension: undefined,
            suspendedAt: undefined,
            suspensionReason: undefined,
          },
    );
    await refreshPhase(ctx, event._id);
    await writeAudit(
      ctx,
      ctx.user._id,
      args.suspended ? "admin.event.suspend" : "admin.event.restore",
      event._id,
      { targetTable: "events", targetId: event._id, data: { reason } },
    );
    return null;
  },
});
export const setEventLimit = superAdminMutation({
  args: { userId: v.id("users"), limit: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.userId);
    if (!target || target.platformRole !== "organizer")
      throw new ConvexError("ORGANIZER_REQUIRED");
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100)
      throw new ConvexError("INVALID_QUOTA");
    await ctx.db.patch(target._id, { eventLimit: args.limit });
    await writeAudit(ctx, ctx.user._id, "admin.user.quota", undefined, {
      targetTable: "users",
      targetId: target._id,
      data: { limit: args.limit },
    });
    return null;
  },
});
export const enterEvent = superAdminMutation({
  args: { eventId: v.id("events") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new ConvexError("NOT_FOUND");
    await writeAudit(ctx, ctx.user._id, "admin.event.enter", event._id, {
      targetTable: "events",
      targetId: event._id,
    });
    return event.slug;
  },
});
const auditView = v.object({
  targetUser: v.union(v.string(), v.null()),
  id: v.id("auditLog"),
  action: v.string(),
  at: v.number(),
  actor: v.string(),
  event: v.union(v.string(), v.null()),
  reason: v.union(v.string(), v.null()),
});
export const audit = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    eventId: v.optional(v.id("events")),
  },
  returns: paginationResultValidator(auditView),
  handler: async (ctx, args) => {
    const query = args.eventId
      ? ctx.db
          .query("auditLog")
          .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      : ctx.db.query("auditLog").withIndex("by_creation_time");
    const result = await query.order("desc").paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (row) => ({
          targetUser:
            row.targetTable === "users" && row.targetId
              ? await (async () => {
                  const id = ctx.db.normalizeId("users", row.targetId!);
                  const user = id ? await ctx.db.get(id) : null;
                  return user?.name ?? user?.wallet ?? null;
                })()
              : null,
          id: row._id,
          action: row.action,
          at: row.at,
          actor: (await ctx.db.get(row.actorId))?.name ?? "Usuario",
          event: row.eventId
            ? ((await ctx.db.get(row.eventId))?.name ?? null)
            : null,
          reason: typeof row.data?.reason === "string" ? row.data.reason : null,
        })),
      ),
    };
  },
});
