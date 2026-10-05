"use node";
import { randomBytes, createHash } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { v, ConvexError } from "convex/values";
import { authedAction, publicAuthAction } from "./lib/functions";
import { internal } from "./_generated/api";
import { staffRole } from "./lib/manageValidators";
function hash(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new ConvexError("INVITE_UNAVAILABLE");
  return createHash("sha256").update(token).digest("hex");
}
export const invite = authedAction({
  args: {
    eventId: v.id("events"),
    role: staffRole,
    wallet: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.object({ token: v.string(), id: v.id("staffInvites") }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    token: string;
    id: import("./_generated/dataModel").Id<"staffInvites">;
  }> => {
    const wallet = args.wallet?.trim() || undefined;
    if (wallet && !StrKey.isValidEd25519PublicKey(wallet))
      throw new ConvexError("INVALID_WALLET");
    const email = args.email?.trim().toLowerCase() || undefined;
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new ConvexError("INVALID_EMAIL");
    const token = randomBytes(32).toString("hex");
    const id = await ctx.runMutation(internal.staffData.create, {
      ...args,
      wallet,
      tokenHash: hash(token),
      email,
      token,
    });
    return { token, id };
  },
});
export const accept = authedAction({
  args: { token: v.string() },
  returns: v.string(),
  handler: async (ctx, { token }): Promise<string> =>
    ctx.runMutation(internal.staffData.claim, { tokenHash: hash(token) }),
});
export const preview = publicAuthAction({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      eventName: v.string(),
      slug: v.string(),
      role: v.string(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (
    ctx,
    { token },
  ): Promise<{
    eventName: string;
    slug: string;
    role: string;
    expiresAt: number;
  } | null> =>
    ctx.runQuery(internal.staffData.preview, { tokenHash: hash(token) }),
});
