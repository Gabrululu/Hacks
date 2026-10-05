import { ConvexError, type Infer } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { EmailEvent } from "@convex-dev/resend";
import { emailSource } from "../lib/emailValidators";
import { emailMode } from "../lib/emailConfig";
import { assertGrant } from "./eventStaff";
import { allowed } from "./campaigns";
import { optedOut } from "./emailAudience";
import { emailLimiter, monthQuota } from "../lib/emailQuota";
import { personalize } from "../lib/emailContent";
import { resendClient } from "../lib/resend";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export async function suppressed(ctx: QueryCtx, email: string) {
  return !!(await ctx.db
    .query("emailSuppressions")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .unique());
}
export async function enqueue(
  ctx: MutationCtx,
  source: Infer<typeof emailSource>,
  verificationCode?: string,
  html?: string,
  unsubscribeHash?: string,
  unsubscribeUrl?: string,
) {
  const sourceKey =
    "verificationId" in source
      ? source.verificationId
      : "notificationId" in source
        ? source.notificationId
        : "recipientId" in source
          ? source.recipientId
          : source.mailId;
  const previous = await ctx.db
    .query("emailDeliveries")
    .withIndex("by_sourceKey", (q) => q.eq("sourceKey", sourceKey))
    .unique();
  if (previous) return previous.status;
  let userId: Doc<"users">["_id"], email: string, subject: string, text: string;
  let eventId: Doc<"events">["_id"] | undefined;
  if ("verificationId" in source) {
    const p = await ctx.db.get(source.verificationId);
    if (!p || p.usedAt || p.expiresAt <= Date.now()) return null;
    const latest = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user", (q) => q.eq("userId", p.userId))
      .order("desc")
      .first();
    if (latest?._id !== p._id) return null;
    if (!verificationCode || !/^[0-9]{6}$/.test(verificationCode))
      throw new ConvexError("INVALID_CODE");
    userId = p.userId;
    email = normalizeEmail(p.email);
    subject = "Tu código de acceso a hacks";
    text = `Tu código de verificación es ${verificationCode}. Expira en 10 minutos. Si no lo solicitaste, ignora este correo.`;
  } else if ("notificationId" in source) {
    const n = await ctx.db.get(source.notificationId);
    if (!n || n.delivery !== "queued") return null;
    const user = await ctx.db.get(n.userId);
    if (!user?.email || !user.emailVerifiedAt || !(await ctx.db.get(n.eventId)))
      return null;
    userId = n.userId;
    email = normalizeEmail(user.email);
    eventId = n.eventId;
    subject = n.subject;
    text = n.body;
  } else if ("mailId" in source) {
    const m = await ctx.db.get(source.mailId);
    if (!m || !(await ctx.db.get(m.eventId))) return null;
    if (m.inviteId) {
      const invite = await ctx.db.get(m.inviteId);
      if (
        !invite ||
        invite.revokedAt !== undefined ||
        invite.claimedBy ||
        invite.expiresAt <= Date.now()
      )
        return null;
      const inviter = await ctx.db.get(invite.createdBy);
      if (
        !inviter ||
        invite.role === "owner" ||
        !(await assertGrant(ctx, inviter, invite.eventId, invite.role)
          .then(() => true)
          .catch(() => false))
      )
        return null;
    }
    userId = m.userId;
    email = m.email;
    eventId = m.eventId;
    subject = m.subject;
    text = m.body;
  } else {
    const r = await ctx.db.get(source.recipientId);
    if (!r || r.status !== "queued") return null;
    const c = await ctx.db.get(r.campaignId);
    const e = c ? await ctx.db.get(c.eventId) : null;
    if (
      !c ||
      !e ||
      c.eventId !== r.eventId ||
      !(await allowed(ctx, c)) ||
      (!r.isTest && c.status !== "sending")
    ) {
      await ctx.db.patch(r._id, { status: "cancelled" });
      return null;
    }
    const u = await ctx.db.get(r.userId);
    if (
      !u?.emailVerifiedAt ||
      u.email?.trim().toLowerCase() !== r.email ||
      u.suspendedAt !== undefined ||
      (c.category === "announcement" &&
        !r.isTest &&
        (await optedOut(ctx, r.eventId, r.userId)))
    ) {
      await ctx.db.patch(r._id, { status: "skipped" });
      return null;
    }
    const data = {
      name: r.name ?? "builder",
      eventName: e.name,
      teamName: r.teamName ?? "tu equipo",
    };
    userId = r.userId;
    email = r.email;
    eventId = r.eventId;
    subject = personalize(c.subject, data);
    text = personalize(c.bodyMarkdown, data, true);
    if (r.isTest) subject = `[Prueba] ${subject}`;
    if (unsubscribeHash) await ctx.db.patch(r._id, { unsubscribeHash });
  }
  const user = await ctx.db.get(userId);
  if (!user || user.suspendedAt !== undefined) return null;
  subject = subject.replace(/[\r\n]/g, " ");
  const mode = emailMode();
  if (mode === "unconfigured") throw new ConvexError("EMAIL_NOT_CONFIGURED");
  let status: Doc<"emailDeliveries">["status"] = (await suppressed(ctx, email))
    ? "suppressed"
    : mode === "development"
      ? "development"
      : "queued";
  if (unsubscribeUrl && "recipientId" in source)
    text += `\n\nDejar de recibir anuncios de este evento: ${unsubscribeUrl}`;
  let error: string | undefined;
  const event = eventId ? await ctx.db.get(eventId) : null;
  if (event?.status === "suspended") return null;
  if (event && status !== "suppressed") {
    const { key, config } = monthQuota(event, Date.now());
    if (!(await emailLimiter.limit(ctx, "eventEmail", { key, config })).ok) {
      status = "failed";
      error = "MONTHLY_QUOTA_EXCEEDED";
    }
  }
  const owner = event ? await ctx.db.get(event.ownerId) : null;
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "";
  const address = fromAddress.match(/<([^<>]+)>/)?.[1] ?? fromAddress;
  const from = event
    ? `"${event.name.replace(/[\r\n"\\]/g, "").slice(0, 100)}" <${address}>`
    : fromAddress;
  // Suppression lookup, component enqueue and tracking commit atomically.
  const componentEmailId =
    status === "queued"
      ? await resendClient().sendEmail(ctx, {
          from,
          ...(owner?.emailVerifiedAt && owner.email
            ? { replyTo: [owner.email] }
            : {}),
          ...(html ? { html } : {}),
          to: email,
          subject,
          text,
          idempotencyKey: sourceKey,
        })
      : undefined;
  await ctx.db.insert("emailDeliveries", {
    sourceKey,
    ...source,
    userId,
    eventId,
    email,
    componentEmailId,
    status,
    error,
    updatedAt: Date.now(),
  });
  const root =
    "verificationId" in source
      ? source.verificationId
      : "notificationId" in source
        ? source.notificationId
        : "recipientId" in source
          ? source.recipientId
          : source.mailId;
  if ("recipientId" in source)
    await ctx.db.patch(source.recipientId, {
      status,
      error,
      resendEmailId: componentEmailId,
      ...(status === "development"
        ? {
            developmentBody: unsubscribeUrl
              ? text.replace(
                  `Dejar de recibir anuncios de este evento: ${unsubscribeUrl}`,
                  `[Dejar de recibir anuncios de este evento](${unsubscribeUrl})`,
                )
              : text,
            developmentSubject: subject,
          }
        : {}),
    });
  else await ctx.db.patch(root, { deliveryStatus: status });
  return status;
}
const priority = {
  skipped: 9,
  cancelled: 9,
  queued: 0,
  sent: 1,
  delivery_delayed: 2,
  failed: 3,
  delivered: 4,
  bounced: 5,
  complained: 6,
  suppressed: 7,
  development: 8,
};
export async function onEvent(
  ctx: MutationCtx,
  componentEmailId: string,
  event: EmailEvent,
) {
  const row = await ctx.db
    .query("emailDeliveries")
    .withIndex("by_componentEmailId", (q) =>
      q.eq("componentEmailId", componentEmailId),
    )
    .unique();
  if (
    !row ||
    (row.providerEmailId && row.providerEmailId !== event.data.email_id)
  )
    return null;
  const status = event.type.slice(6) as keyof typeof priority;
  if (!(status in priority)) return null; // No open/click tracking or IP storage.
  const hardBounce =
    event.type === "email.bounced" &&
    event.data.bounce.type.toLowerCase() === "permanent";
  if (hardBounce || event.type === "email.complained") {
    const old = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", row.email))
      .unique();
    const reason =
      old?.reason === "complaint" || event.type === "email.complained"
        ? "complaint"
        : "hard_bounce";
    if (!old)
      await ctx.db.insert("emailSuppressions", {
        email: row.email,
        reason,
        sourceDeliveryId: row._id,
        updatedAt: Date.now(),
      });
    else if (reason !== old.reason)
      await ctx.db.patch(old._id, {
        reason,
        sourceDeliveryId: row._id,
        updatedAt: Date.now(),
      });
  }
  if (priority[status] <= priority[row.status]) return null;
  await ctx.db.patch(row._id, {
    status,
    providerEmailId: event.data.email_id,
    updatedAt: Date.now(),
  });
  const root = row.verificationId ?? row.notificationId ?? row.mailId;
  if (row.recipientId && (await ctx.db.get(row.recipientId)))
    await ctx.db.patch(row.recipientId, { status });
  if (root && (await ctx.db.get(root)))
    await ctx.db.patch(root, { deliveryStatus: status });
  return null;
}
