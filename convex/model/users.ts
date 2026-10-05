import type { MutationCtx } from "../lib/types";
export async function seedSuperadmins(ctx: MutationCtx) {
  const wallets = (process.env.SUPERADMIN_WALLETS ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
  if (!wallets.length)
    throw new Error("Configure SUPERADMIN_WALLETS on Convex first");
  for (const wallet of wallets) {
    if (!/^G[A-Z2-7]{55}$/.test(wallet))
      throw new Error("Invalid Stellar public key");
    const user = await ctx.db
      .query("users")
      .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
      .unique();
    if (user) await ctx.db.patch(user._id, { platformRole: "superadmin" });
    else await ctx.db.insert("users", { wallet, platformRole: "superadmin" });
  }
  return wallets.length;
}

export async function upsertWalletUser(
  ctx: MutationCtx,
  wallet: string,
  issuer: string,
) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
    .unique();
  if (existing?.suspendedAt !== undefined) throw new Error("ACCOUNT_SUSPENDED");
  const userId = existing
    ? existing._id
    : await ctx.db.insert("users", { wallet, platformRole: "user" });
  await ctx.db.patch(userId, { tokenIdentifier: `${issuer}|${userId}` });
  return userId;
}

export async function updateProfile(
  ctx: MutationCtx,
  userId: import("../_generated/dataModel").Id<"users">,
  profile: {
    name: string;
    bio: string;
    links: { github?: string; x?: string; linkedin?: string };
  },
) {
  await ctx.db.patch(userId, profile);
}
export async function verifyEmail(
  ctx: MutationCtx,
  userId: import("../_generated/dataModel").Id<"users">,
  email: string,
) {
  await ctx.db.patch(userId, { email, emailVerifiedAt: Date.now() });
}

export async function approveOrganizer(
  ctx: MutationCtx,
  id: import("../_generated/dataModel").Id<"users">,
  eventLimit: number,
) {
  const user = await ctx.db.get(id);
  if (!user || user.suspendedAt !== undefined) throw new Error("FORBIDDEN");
  await ctx.db.patch(id, {
    platformRole:
      user.platformRole === "superadmin" ? "superadmin" : "organizer",
    eventLimit,
  });
}
