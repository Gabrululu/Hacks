import { ConvexError } from "convex/values";
import type { MutationCtx } from "../lib/types";
import type { Id } from "../_generated/dataModel";
export async function saveChallenge(
  ctx: MutationCtx,
  data: {
    wallet: string;
    nonce: string;
    xdr: string;
    network: "testnet" | "mainnet";
    expiresAt: number;
  },
) {
  const recent = await ctx.db
    .query("authChallenges")
    .withIndex("by_wallet", (q) => q.eq("wallet", data.wallet))
    .order("desc")
    .take(3);
  if (recent.length === 3 && recent[2]._creationTime > Date.now() - 60_000)
    throw new ConvexError("RATE_LIMITED");
  await ctx.db.insert("authChallenges", { ...data, attempts: 0 });
}
export async function beginVerification(ctx: MutationCtx, nonce: string) {
  const challenge = await ctx.db
    .query("authChallenges")
    .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
    .unique();
  if (
    !challenge ||
    !challenge.xdr ||
    !challenge.network ||
    challenge.usedAt !== undefined ||
    challenge.expiresAt <= Date.now()
  )
    throw new ConvexError("INVALID_CHALLENGE");
  if ((challenge.attempts ?? 0) >= 5) throw new ConvexError("RATE_LIMITED");
  await ctx.db.patch(challenge._id, {
    attempts: (challenge.attempts ?? 0) + 1,
  });
  return {
    id: challenge._id,
    wallet: challenge.wallet,
    xdr: challenge.xdr,
    network: challenge.network,
    expiresAt: challenge.expiresAt,
  };
}
export async function consumeChallenge(
  ctx: MutationCtx,
  id: Id<"authChallenges">,
) {
  const challenge = await ctx.db.get(id);
  if (
    !challenge ||
    challenge.usedAt !== undefined ||
    challenge.expiresAt <= Date.now()
  )
    throw new ConvexError("INVALID_CHALLENGE");
  await ctx.db.patch(id, { usedAt: Date.now() });
  return challenge;
}
export async function pruneChallenges(ctx: MutationCtx) {
  const expired = await ctx.db
    .query("authChallenges")
    .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
    .take(100);
  for (const c of expired) await ctx.db.delete(c._id);
  return expired.length;
}
