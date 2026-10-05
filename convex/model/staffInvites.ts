import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { assertGrant, claim as joinStaff } from "./eventStaff";
import { writeAudit } from "./auditLog";
type Role = Exclude<Doc<"eventStaff">["role"], "owner">;
export async function create(
  ctx: MutationCtx,
  actor: Doc<"users">,
  args: {
    eventId: Id<"events">;
    role: Role;
    wallet?: string;
    tokenHash: string;
    email?: string;
    token?: string;
  },
) {
  await assertGrant(ctx, actor, args.eventId, args.role);
  const id = await ctx.db.insert("staffInvites", {
    eventId: args.eventId,
    role: args.role,
    wallet: args.wallet,
    email: args.email,
    tokenHash: args.tokenHash,
    expiresAt: Date.now() + 3 * 86400000,
    createdBy: actor._id,
  });
  const recipient = args.wallet ? await ctx.db.query("users").withIndex("by_wallet", q => q.eq("wallet", args.wallet!)).unique() : null;
  const email = args.email ?? (recipient?.emailVerifiedAt ? recipient.email : undefined);
  if (email && args.token) {
    const event = (await ctx.db.get(args.eventId))!;
    const mailId = await ctx.db.insert("eventMail", {
      eventId: args.eventId, userId: recipient?._id ?? actor._id, email,
      subject: `Invitación al staff de ${event.name}`,
      body: `Te han invitado como ${args.role} a ${event.name}. El enlace dura tres días y solo puede utilizarse una vez.\n\n[Aceptar invitación](${process.env.APP_URL ?? "https://hacks.mintedinpe.com"}/invite/${args.token})`,
      inviteId: id, visibleToRecipient: !!recipient && recipient.email === email && !!recipient.emailVerifiedAt,
    });
    await ctx.scheduler.runAfter(0, internal.communicationEmails.deliver, { source: { mailId } });
  }
  await writeAudit(ctx, actor._id, `staff.invite.${args.role}`, args.eventId, {
    targetTable: "staffInvites",
    targetId: id,
  });
  return id;
}
export async function claim(
  ctx: MutationCtx,
  user: Doc<"users">,
  tokenHash: string,
) {
  const invite = await ctx.db
    .query("staffInvites")
    .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (
    !invite ||
    invite.revokedAt !== undefined ||
    invite.claimedBy ||
    invite.expiresAt <= Date.now()
  )
    throw new ConvexError("INVITE_UNAVAILABLE");
  if (invite.wallet && invite.wallet !== user.wallet)
    throw new ConvexError("WALLET_MISMATCH");
  const inviter = await ctx.db.get(invite.createdBy);
  if (!inviter || inviter.suspendedAt !== undefined || invite.role === "owner")
    throw new ConvexError("INVITE_UNAVAILABLE");
  // The inviter must still be allowed to grant this role when the token is claimed.
  await assertGrant(ctx, inviter, invite.eventId, invite.role);
  await joinStaff(
    ctx,
    invite.eventId,
    user._id,
    invite.role,
    invite._creationTime,
  );
  await ctx.db.patch(invite._id, { claimedBy: user._id });
  await writeAudit(ctx, user._id, "staff.accept", invite.eventId);
  const event = await ctx.db.get(invite.eventId);
  return event!.slug;
}
export async function revoke(
  ctx: MutationCtx,
  eventId: Id<"events">,
  inviteId: Id<"staffInvites">,
) {
  const invite = await ctx.db.get(inviteId);
  if (!invite || invite.eventId !== eventId || invite.claimedBy)
    throw new ConvexError("INVITE_UNAVAILABLE");
  await ctx.db.patch(inviteId, { revokedAt: Date.now() });
  return null;
}
