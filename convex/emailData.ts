import { deliveryStatus } from "./lib/emailValidators";
import schema from "./schema";
import { doc } from "convex-helpers/validators";
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { requireUser } from "./lib/permissions";
import { authedQuery } from "./lib/functions";
import { emailMode } from "./lib/emailConfig";
import * as verificationModel from "./model/emailVerifications";
export const pending = internalQuery({
  args: {},
  returns: v.union(doc(schema, "emailVerifications"), v.null()),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("emailVerifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
  },
});
export const status = authedQuery({
  args: {},
  returns: v.object({
    mode: v.union(
      v.literal("development"),
      v.literal("resend"),
      v.literal("unconfigured"),
    ),
    pending: v.union(
      v.null(),
      v.object({
        email: v.string(),
        expiresAt: v.number(),
        retryAt: v.number(),
        attempts: v.number(),
        delivery: v.union(
          v.literal("queued"),
          v.literal("development"),
          v.literal("failed"),
        ),
        deliveryStatus: v.union(deliveryStatus, v.null()),
        developmentCode: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx) => {
    const p = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .first();
    const mode = emailMode();
    return {
      mode,
      pending:
        p && !p.usedAt
          ? {
              email: p.email,
              expiresAt: p.expiresAt,
              retryAt: p._creationTime + 60000,
              attempts: p.attempts,
              delivery: p.delivery ?? "queued",
              deliveryStatus: p.deliveryStatus ?? null,
              developmentCode:
                mode === "development" ? (p.developmentCode ?? null) : null,
            }
          : null,
    };
  },
});
export const create = internalMutation({
  args: {
    email: v.string(),
    codeHash: v.string(),
    nonce: v.string(),
    code: v.string(),
  },
  returns: v.null(),
  handler: verificationModel.create,
});
export const confirm = internalMutation({
  args: { id: v.id("emailVerifications"), codeHash: v.string() },
  returns: v.union(
    v.literal("expired"),
    v.literal("locked"),
    v.literal("invalid"),
    v.literal("verified"),
  ),
  handler: verificationModel.confirm,
});
export const deliveryData = internalQuery({
  args: { id: v.id("emailVerifications") },
  returns: v.union(doc(schema, "emailVerifications"), v.null()),
  handler: async (ctx, { id }) => {
    const record = await ctx.db.get(id);
    if (!record) return null;
    const latest = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user", (q) => q.eq("userId", record.userId))
      .order("desc")
      .first();
    return latest?._id === id ? record : null;
  },
});
export const mark = internalMutation({
  args: {
    id: v.id("emailVerifications"),
    delivery: v.union(
      v.literal("queued"),
      v.literal("development"),
      v.literal("failed"),
    ),
    code: v.optional(v.string()),
  },
  returns: v.null(),
  handler: verificationModel.mark,
});

export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: verificationModel.cleanup,
});
