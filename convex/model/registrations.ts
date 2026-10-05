import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { validateAnswers, type Answers } from "../lib/formEngine";
import { published } from "./forms";
import * as totals from "./registrationTotals";
import { enqueue } from "./registrationNotifications";
import { writeAudit } from "./auditLog";
export async function registrationEvent(ctx: QueryCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event || event.status !== "published")
    throw new ConvexError("EVENT_NOT_PUBLISHED");
  return event;
}
export async function openRegistration(
  ctx: QueryCtx,
  eventId: Id<"events">,
  now: number,
) {
  const event = await registrationEvent(ctx, eventId);
  if (
    now < event.timeline.registrationOpensAt ||
    now >= event.timeline.registrationClosesAt
  )
    throw new ConvexError("REGISTRATION_CLOSED");
  return event;
}
export async function submit(
  ctx: MutationCtx,
  user: Doc<"users">,
  eventId: Id<"events">,
  formId: Id<"forms">,
  answers: Answers,
  rulesAccepted: boolean,
  consentAccepted: boolean,
  emailOptOut: boolean,
) {
  const event = await openRegistration(ctx, eventId, Date.now());
  if (!user.name?.trim() || !user.email || !user.emailVerifiedAt)
    throw new ConvexError("PROFILE_INCOMPLETE");
  if (!rulesAccepted || !consentAccepted)
    throw new ConvexError("CONSENT_REQUIRED");
  if (
    await ctx.db
      .query("registrations")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("userId", user._id),
      )
      .unique()
  )
    throw new ConvexError("ALREADY_REGISTERED");
  const form = await published(ctx, eventId);
  if (!form || form._id !== formId) throw new ConvexError("FORM_CHANGED");
  const clean = validateAnswers(form.fields, answers);
  for (const f of form.fields)
    if (f.type === "file" && typeof clean[f.id] === "string" && clean[f.id]) {
      const fileId = ctx.db.system.normalizeId(
        "_storage",
        clean[f.id] as string,
      );
      if (!fileId) throw new ConvexError("INVALID_FILE");
      const upload = await ctx.db
        .query("registrationUploads")
        .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
        .unique();
      if (
        !upload ||
        upload.userId !== user._id ||
        upload.eventId !== eventId ||
        upload.formId !== formId ||
        upload.fieldId !== f.id
      )
        throw new ConvexError("INVALID_FILE");
    }
  const count = await totals.get(ctx, eventId);
  const status =
    event.settings.admission === "manual"
      ? "pending"
      : event.settings.capacity !== undefined &&
          count.admitted >= event.settings.capacity
        ? "waitlisted"
        : "approved";
  if (status === "approved") await totals.adjust(ctx, eventId, 1);
  const now = Date.now();
  const id = await ctx.db.insert("registrations", {
    eventId,
    userId: user._id,
    status,
    formVersion: form.version,
    formId,
    fieldSnapshot: form.fields,
    answers: clean,
    consentAt: now,
    rulesAcceptedAt: now,
    consentText: form.consentText,
    rulesText: form.rulesText,
    nameSnapshot: user.name,
    emailSnapshot: user.email,
    walletSnapshot: user.wallet,
    emailOptOut,
    revision: 1,
  });
  await enqueue(ctx, (await ctx.db.get(id))!);
  await writeAudit(ctx, user._id, "registration.submit", eventId, {
    targetTable: "registrations",
    targetId: id,
    data: { status, formVersion: form.version },
  });
  return id;
}
export async function review(
  ctx: MutationCtx,
  user: Doc<"users">,
  eventId: Id<"events">,
  ids: Id<"registrations">[],
  status: "approved" | "rejected" | "waitlisted",
) {
  const event = await registrationEvent(ctx, eventId);
  if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length)
    throw new ConvexError("INVALID_SELECTION");
  const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));
  if (rows.some((r) => !r || r.eventId !== eventId))
    throw new ConvexError("NOT_FOUND");
  const count = await totals.get(ctx, eventId);
  let delta = 0;
  for (const r of rows) {
    if (!r) continue;
    if (["checked_in", "withdrawn"].includes(r.status))
      throw new ConvexError("INVALID_TRANSITION");
    if (status === "approved" && r.status !== "approved") delta++;
    if (status !== "approved" && r.status === "approved") delta--;
  }
  if (
    event.settings.capacity !== undefined &&
    count.admitted + delta > event.settings.capacity
  )
    throw new ConvexError("CAPACITY_REACHED");
  if (delta) await totals.adjust(ctx, eventId, delta);
  for (const r of rows) {
    if (!r || r.status === status) continue;
    await ctx.db.patch(r._id, {
      status,
      reviewedBy: user._id,
      revision: (r.revision ?? 1) + 1,
    });
    await enqueue(ctx, (await ctx.db.get(r._id))!);
    await writeAudit(ctx, user._id, "registration.review", eventId, {
      targetTable: "registrations",
      targetId: r._id,
      data: { from: r.status, to: status },
    });
  }
  return null;
}
export async function withdraw(
  ctx: MutationCtx,
  user: Doc<"users">,
  id: Id<"registrations">,
) {
  const r = await ctx.db.get(id);
  if (!r || r.userId !== user._id) throw new ConvexError("NOT_FOUND");
  const event = await registrationEvent(ctx, r.eventId);
  const membership=await ctx.db.query("teamMembers").withIndex("by_event_user",q=>q.eq("eventId",r.eventId).eq("userId",user._id)).unique();
  if(membership){const project=await ctx.db.query("submissions").withIndex("by_event_team",q=>q.eq("eventId",r.eventId).eq("teamId",membership.teamId)).unique();if(project?.submittedAt!==undefined)throw new ConvexError("PROJECT_TEAM_LOCKED");}
  if (r.status === "checked_in") throw new ConvexError("INVALID_TRANSITION");
  if (r.status === "withdrawn") return null;
  if (r.status === "approved") await totals.adjust(ctx, r.eventId, -1);
  await ctx.db.patch(id, {
    status: "withdrawn",
    revision: (r.revision ?? 1) + 1,
  });
  await enqueue(ctx, (await ctx.db.get(id))!);
  await writeAudit(ctx, user._id, "registration.withdraw", r.eventId, {
    targetTable: "registrations",
    targetId: id,
  });
  // Admit the earliest waiting participant when a capped event frees a seat.
  if (r.status === "approved" && event.settings.admission === "capped") {
    const next = await ctx.db
      .query("registrations")
      .withIndex("by_event_status", (q) =>
        q.eq("eventId", r.eventId).eq("status", "waitlisted"),
      )
      .first();
    const count = await totals.get(ctx, r.eventId);
    if (
      next &&
      (event.settings.capacity === undefined ||
        count.admitted < event.settings.capacity)
    ) {
      await totals.adjust(ctx, r.eventId, 1);
      await ctx.db.patch(next._id, {
        status: "approved",
        revision: (next.revision ?? 1) + 1,
      });
      await enqueue(ctx, (await ctx.db.get(next._id))!);
      await writeAudit(ctx, user._id, "registration.promoted", r.eventId, {
        targetTable: "registrations",
        targetId: next._id,
      });
    }
  }
  return null;
}
export async function checkIn(
  ctx: MutationCtx,
  user: Doc<"users">,
  eventId: Id<"events">,
  id: Id<"registrations">,
) {
  const event = await registrationEvent(ctx, eventId),
    r = await ctx.db.get(id);
  if (!r || r.eventId !== eventId) throw new ConvexError("INVALID_PASS");
  if (Date.now() < event.timeline.startsAt)
    throw new ConvexError("EVENT_NOT_STARTED");
  if (Date.now() > event.timeline.judgingClosesAt + 86400000)
    throw new ConvexError("CHECKIN_CLOSED");
  if (r.status === "checked_in") return "already_checked_in" as const;
  if (r.status !== "approved") throw new ConvexError("NOT_APPROVED");
  await ctx.db.patch(id, {
    status: "checked_in",
    checkedInAt: Date.now(),
    checkedInBy: user._id,
    revision: (r.revision ?? 1) + 1,
  });
  await enqueue(ctx, (await ctx.db.get(id))!);
  await writeAudit(ctx, user._id, "registration.check_in", eventId, {
    targetTable: "registrations",
    targetId: id,
  });
  return "checked_in" as const;
}
