import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import schema from "./schema";
import {
  authedQuery,
  authedMutation,
  eventMutation,
  eventQuery,
  superAdminQuery,
} from "./lib/functions";
import { effectivePermissions } from "./lib/permissions";
import { eventType, eventDetails } from "./lib/manageValidators";
import * as events from "./model/events";
const eventSummary = v.object({
  id: v.id("events"),
  slug: v.string(),
  name: v.string(),
  type: eventType,
  status: v.union(
    v.literal("draft"),
    v.literal("published"),
    v.literal("archived"),
    v.literal("suspended"),
  ),
  role: v.string(),
});
export const mine = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(eventSummary),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("eventStaff")
      .withIndex("by_user_and_revokedAt", (q) =>
        q.eq("userId", ctx.user._id).eq("revokedAt", undefined),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (staff) => {
        const event = await ctx.db.get(staff.eventId);
        return event
          ? {
              id: event._id,
              slug: event.slug,
              name: event.name,
              type: event.type,
              status: event.status,
              role: staff.role,
            }
          : null;
      }),
    );
    return {
      ...result,
      page: page.filter((e): e is NonNullable<typeof e> => e !== null),
    };
  },
});
export const all = superAdminQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(eventSummary),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("events")
      .withIndex("by_creation_time")
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((event) => ({
        id: event._id,
        slug: event.slug,
        name: event.name,
        type: event.type,
        status: event.status,
        role: "superadmin",
      })),
    };
  },
});
export const detail = authedQuery({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      event: doc(schema, "events"),
      permissions: v.array(v.string()),
      role: v.string(),
    }),
  ),
  handler: async (ctx, { slug }) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!event) return null;
    const membership = await ctx.db
      .query("eventStaff")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", event._id).eq("userId", ctx.user._id),
      )
      .first();
    const organizationMembership = event.organizationId
      ? await ctx.db
          .query("organizationMembers")
          .withIndex("by_organization_and_user", (q) =>
            q.eq("organizationId", event.organizationId!).eq("userId", ctx.user._id),
          )
          .first()
      : null;
    const isOrganizationMember =
      organizationMembership?.revokedAt === undefined && !!organizationMembership;
    if (
      ctx.user.platformRole !== "superadmin" &&
      ((!membership || membership.revokedAt !== undefined) && !isOrganizationMember)
      )
      return null;
    return {
      event,
      permissions: await effectivePermissions(ctx, ctx.user, event._id),
      role:
        ctx.user.platformRole === "superadmin"
          ? "superadmin"
          : isOrganizationMember
            ? "owner"
            : membership!.role,
    };
  },
});
export const create = authedMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    type: eventType,
    timezone: v.string(),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => events.create(ctx, ctx.user, args),
});
export const update = eventMutation(
  "event.edit",
  "event.update",
)({
  args: eventDetails,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { eventId, ...input } = args;
    return events.update(ctx, eventId, input);
  },
});
export const audit = eventQuery("audit.view")({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    doc(schema, "auditLog").extend({ actorName: v.string() }),
  ),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("auditLog")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (log) => {
          const user = await ctx.db.get(log.actorId);
          return {
            ...log,
            actorName:
              user?.name ??
              (user
                ? `${user.wallet.slice(0, 5)}…${user.wallet.slice(-5)}`
                : "Cuenta no disponible"),
          };
        }),
      ),
    };
  },
});
