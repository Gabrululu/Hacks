import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../lib/types";
import type { Id } from "../_generated/dataModel";
export async function createSession(
  ctx: MutationCtx,
  userId: Id<"users">,
  tokenHash: string,
  network: "testnet" | "mainnet",
) {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60_000;
  const id = await ctx.db.insert("authSessions", {
    userId,
    tokenHash,
    userSessionVersion: (await ctx.db.get(userId))?.sessionVersion ?? 0,
    network,
    expiresAt,
  });
  return { id, expiresAt };
}
export async function findSession(ctx: QueryCtx, tokenHash: string) {
  const session = await ctx.db
    .query("authSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (
    !session ||
    session.revokedAt !== undefined ||
    session.expiresAt <= Date.now()
  )
    throw new ConvexError("SESSION_EXPIRED");
  const user = await ctx.db.get(session.userId);
  if (!user || user.suspendedAt !== undefined)
    throw new ConvexError("ACCOUNT_SUSPENDED");
  if ((session.userSessionVersion ?? 0) !== (user.sessionVersion ?? 0))
    throw new ConvexError("SESSION_EXPIRED");
  return {
    id: session._id,
    userId: user._id,
    wallet: user.wallet,
    network: session.network,
    expiresAt: session.expiresAt,
  };
}
export async function revokeSession(ctx: MutationCtx, tokenHash: string) {
  const session = await ctx.db
    .query("authSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (session && session.revokedAt === undefined)
    await ctx.db.patch(session._id, { revokedAt: Date.now() });
}
export async function pruneSessions(ctx: MutationCtx) {
  const expired = await ctx.db
    .query("authSessions")
    .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
    .take(100);
  for (const s of expired) await ctx.db.delete(s._id);
  return expired.length;
}
