import { v } from "convex/values";
export const networkValidator = v.union(
  v.literal("testnet"),
  v.literal("mainnet"),
);
export const sessionResult = v.object({
  token: v.string(),
  refreshToken: v.string(),
  wallet: v.string(),
  network: networkValidator,
  expiresAt: v.number(),
  sessionExpiresAt: v.number(),
});
