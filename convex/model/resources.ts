import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUser, effectivePermissions } from "../lib/permissions";
import { safeUrl, PHASES } from "../lib/presentation";
import { requireAsset } from "./eventAssets";
import { editable, text, order } from "./contentShared";
export async function save(
  ctx: MutationCtx,
  eventId: Id<"events">,
  id: Id<"resources"> | undefined,
  input: Omit<Doc<"resources">, "_id" | "_creationTime" | "eventId">,
) {
  await editable(ctx, eventId);
  text(input.title, 2, 160);
  order(input.order);
  text(input.body ?? "", 0, 10000);
  if (input.featuredFrom && !PHASES.includes(input.featuredFrom))
    throw new ConvexError("INVALID_PHASE");
  if (
    input.kind === "link" &&
    (!input.url || !safeUrl(input.url) || input.url.length > 2000)
  )
    throw new ConvexError("INVALID_URL");
  if (input.kind === "file") {
    if (!input.fileId) throw new ConvexError("FILE_REQUIRED");
    await requireAsset(ctx, eventId, input.fileId, "resource");
  }
  if (input.kind === "markdown" && !input.body?.trim())
    throw new ConvexError("BODY_REQUIRED");
  const clean = {
    title: input.title.trim(),
    kind: input.kind,
    order: input.order,
    visibility: input.visibility,
    featuredFrom: input.featuredFrom,
    url: input.kind === "link" ? input.url : undefined,
    fileId: input.kind === "file" ? input.fileId : undefined,
    body: input.kind === "markdown" ? input.body : undefined,
  };
  if (id) {
    const old = await ctx.db.get(id);
    if (!old || old.eventId !== eventId) throw new ConvexError("NOT_FOUND");
    await ctx.db.patch(id, clean);
    return id;
  }
  if (
    (
      await ctx.db
        .query("resources")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(100)
    ).length >= 100
  )
    throw new ConvexError("CONTENT_LIMIT");
  return ctx.db.insert("resources", { eventId, ...clean });
}
export async function remove(
  ctx: MutationCtx,
  eventId: Id<"events">,
  id: Id<"resources">,
) {
  await editable(ctx, eventId);
  const old = await ctx.db.get(id);
  if (!old || old.eventId !== eventId) throw new ConvexError("NOT_FOUND");
  await ctx.db.delete(id);
  return null;
}
export async function allowed(ctx: QueryCtx, resource: Doc<"resources">) {
  const event = await ctx.db.get(resource.eventId);
  if (!event) return false;
  if (event.status === "published" && resource.visibility === "public")
    return true;
  if (!(await ctx.auth.getUserIdentity())) return false;
  const user = await requireUser(ctx),
    permissions = await effectivePermissions(ctx, user, event._id);
  if (permissions.length) return true;
  const staff = await ctx.db
    .query("eventStaff")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", event._id).eq("userId", user._id),
    )
    .first();
  if (staff && staff.revokedAt === undefined) return true;
  if (event.status !== "published" || resource.visibility === "staff")
    return false;
  const registration = await ctx.db
    .query("registrations")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", event._id).eq("userId", user._id),
    )
    .unique();
  if (!registration) return false;
  return resource.visibility === "registered"
    ? ["pending", "approved", "checked_in", "waitlisted"].includes(
        registration.status,
      )
    : ["approved", "checked_in"].includes(registration.status);
}
