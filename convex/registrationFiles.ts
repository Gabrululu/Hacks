import { v, ConvexError } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { requireUser, can, isEventOrganizer } from "./lib/permissions";
import { FILE_TYPES } from "./lib/formEngine";
import { published } from "./model/forms";
import { registrationEvent } from "./model/registrations";
import { register } from "./model/registrationUploads";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
async function authorize(
  ctx: QueryCtx,
  eventId: Id<"events">,
  formId: Id<"forms">,
  fieldId: string,
  now: number,
) {
  const user = await requireUser(ctx),
    event = await registrationEvent(ctx, eventId),
    form = await published(ctx, eventId);
  if (
    now < event.timeline.registrationOpensAt ||
    now >= event.timeline.registrationClosesAt
  )
    throw new ConvexError("REGISTRATION_CLOSED");
  if (!user.name || !user.emailVerifiedAt)
    throw new ConvexError("PROFILE_INCOMPLETE");
  const existing = await ctx.db
    .query("registrations")
    .withIndex("by_event_user", (q) =>
      q.eq("eventId", eventId).eq("userId", user._id),
    )
    .unique();
  if (existing) throw new ConvexError("ALREADY_REGISTERED");
  const field = form?.fields.find((f) => f.id === fieldId && f.type === "file");
  if (!form || form._id !== formId || !field)
    throw new ConvexError("FORM_CHANGED");
  return { user, field };
}
export const authorizeUpload = internalQuery({
  args: {
    eventId: v.id("events"),
    formId: v.id("forms"),
    fieldId: v.string(),
    now: v.number(),
  },
  returns: v.object({ maxMB: v.number(), accept: v.array(v.string()) }),
  handler: async (ctx, a) => {
    const { field } = await authorize(
      ctx,
      a.eventId,
      a.formId,
      a.fieldId,
      a.now,
    );
    return {
      maxMB: field.validation?.maxFileMB ?? 5,
      accept:
        field.validation?.accept?.split(",").map((s) => s.trim()) ?? FILE_TYPES,
    };
  },
});
export const registerUpload = internalMutation({
  args: {
    eventId: v.id("events"),
    formId: v.id("forms"),
    fieldId: v.string(),
    fileId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const { user, field } = await authorize(
        ctx,
        a.eventId,
        a.formId,
        a.fieldId,
        Date.now(),
      ),
      meta = await ctx.db.system.get(a.fileId),
      accept =
        field.validation?.accept?.split(",").map((s) => s.trim()) ?? FILE_TYPES;
    if (
      !meta ||
      meta.size > (field.validation?.maxFileMB ?? 5) * 1024 * 1024 ||
      !accept.includes(a.contentType) ||
      (meta.contentType !== undefined && meta.contentType !== a.contentType)
    )
      throw new ConvexError("INVALID_FILE");
    return register(
      ctx,
      a.eventId,
      user._id,
      a.formId,
      a.fieldId,
      a.fileId,
      a.name,
    );
  },
});
export const download = internalQuery({
  args: { registrationId: v.id("registrations"), fieldId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ fileId: v.id("_storage"), name: v.string() }),
  ),
  handler: async (ctx, a) => {
    const user = await requireUser(ctx),
      r = await ctx.db.get(a.registrationId);
    if (!r) return null;
    const field = r.fieldSnapshot?.find(
      (f) => f.id === a.fieldId && f.type === "file",
    );
    if (!field) return null;
    if (
      r.userId !== user._id &&
      (!(await can(ctx, user, r.eventId, "registrations.view")) ||
        (field.staffVisibility === "organizers" &&
          !(await isEventOrganizer(ctx, user, r.eventId))))
    )
      return null;
    const raw = r.answers[a.fieldId],
      fileId =
        typeof raw === "string"
          ? ctx.db.system.normalizeId("_storage", raw)
          : null;
    if (!fileId) return null;
    const upload = await ctx.db
      .query("registrationUploads")
      .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
      .unique();
    return upload &&
      upload.eventId === r.eventId &&
      upload.userId === r.userId &&
      upload.fieldId === a.fieldId
      ? { fileId, name: upload.name }
      : null;
  },
});
