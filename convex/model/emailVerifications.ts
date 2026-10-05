import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { requireUser } from "../lib/permissions";
import { emailMode } from "../lib/emailConfig";
import { suppressed } from "./emailDeliveries";
import { verifyEmail } from "./users";

export async function create(
  ctx: MutationCtx,
  args: { email: string; codeHash: string; nonce: string; code: string },
): Promise<null> {
  const user = await requireUser(ctx);
  if (await suppressed(ctx, args.email))
    throw new ConvexError("EMAIL_SUPPRESSED");
  const recent = await ctx.db
    .query("emailVerifications")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .order("desc")
    .take(3);
  const now = Date.now();
  if (
    (recent[0] && now - recent[0]._creationTime < 60000) ||
    (recent.length === 3 && now - recent[2]._creationTime < 3600000)
  )
    throw new ConvexError("EMAIL_RATE_LIMITED");
  const id = await ctx.db.insert("emailVerifications", {
    userId: user._id,
    email: args.email,
    codeHash: args.codeHash,
    nonce: args.nonce,
    expiresAt: now + 600000,
    attempts: 0,
    delivery: "queued",
  });
  await ctx.scheduler.runAfter(0, internal.emails.deliver, {
    id,
    code: args.code,
  });
  return null;
}

export async function confirm(
  ctx: MutationCtx,
  args: { id: Id<"emailVerifications">; codeHash: string },
): Promise<"expired" | "locked" | "invalid" | "verified"> {
  const user = await requireUser(ctx);
  const p = await ctx.db
    .query("emailVerifications")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .order("desc")
    .first();
  if (!p || p._id !== args.id || p.usedAt || p.expiresAt <= Date.now())
    return "expired";
  if (p.attempts >= 5) return "locked";
  if (p.codeHash !== args.codeHash) {
    await ctx.db.patch(p._id, { attempts: p.attempts + 1 });
    return p.attempts + 1 >= 5 ? "locked" : "invalid";
  }
  await verifyEmail(ctx, user._id, p.email);
  await ctx.db.patch(p._id, {
    usedAt: Date.now(),
    developmentCode: undefined,
  });
  return "verified";
}

export async function mark(
  ctx: MutationCtx,
  args: {
    id: Id<"emailVerifications">;
    delivery: "queued" | "development" | "failed";
    code?: string;
  },
): Promise<null> {
  const record = await ctx.db.get(args.id);
  if (!record || record.usedAt || record.expiresAt <= Date.now()) return null;
  await ctx.db.patch(args.id, {
    delivery: args.delivery,
    developmentCode: emailMode() === "development" ? args.code : undefined,
  });
  return null;
}

export async function cleanup(ctx: MutationCtx): Promise<null> {
  const old = await ctx.db
    .query("emailVerifications")
    .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now() - 86400000))
    .take(100);
  for (const item of old) await ctx.db.delete(item._id);
  return null;
}
