import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/functions";
import { v, ConvexError } from "convex/values";
import { networkValidator } from "./lib/authValidators";
import {
  saveChallenge,
  beginVerification,
  consumeChallenge,
  pruneChallenges,
} from "./model/authChallenges";
import {
  createSession,
  findSession,
  revokeSession,
  pruneSessions,
} from "./model/authSessions";
import { upsertWalletUser } from "./model/users";
export const storeChallenge = internalMutation({
  args: {
    wallet: v.string(),
    nonce: v.string(),
    xdr: v.string(),
    network: networkValidator,
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await saveChallenge(ctx, args);
    return null;
  },
});
export const begin = internalMutation({
  args: { nonce: v.string() },
  returns: v.object({
    id: v.id("authChallenges"),
    wallet: v.string(),
    xdr: v.string(),
    network: networkValidator,
    expiresAt: v.number(),
  }),
  handler: (ctx, { nonce }) => beginVerification(ctx, nonce),
});
export const complete = internalMutation({
  args: { challengeId: v.id("authChallenges"), tokenHash: v.string() },
  returns: v.object({
    id: v.id("authSessions"),
    userId: v.id("users"),
    wallet: v.string(),
    network: networkValidator,
    expiresAt: v.number(),
  }),
  handler: async (ctx, { challengeId, tokenHash }) => {
    const issuer = process.env.AUTH_ISSUER;
    if (!issuer) throw new ConvexError("AUTH_NOT_CONFIGURED");
    const challenge = await consumeChallenge(ctx, challengeId);
    if (!challenge.network) throw new ConvexError("INVALID_CHALLENGE");
    const userId = await upsertWalletUser(ctx, challenge.wallet, issuer);
    const session = await createSession(
      ctx,
      userId,
      tokenHash,
      challenge.network,
    );
    return {
      ...session,
      userId,
      wallet: challenge.wallet,
      network: challenge.network,
    };
  },
});
export const session = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.object({
    id: v.id("authSessions"),
    userId: v.id("users"),
    wallet: v.string(),
    network: networkValidator,
    expiresAt: v.number(),
  }),
  handler: (ctx, { tokenHash }) => findSession(ctx, tokenHash),
});
export const revoke = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, { tokenHash }) => {
    await revokeSession(ctx, tokenHash);
    return null;
  },
});
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await pruneChallenges(ctx);
    await pruneSessions(ctx);
    return null;
  },
});
