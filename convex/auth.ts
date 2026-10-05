"use node";
import { randomBytes, createHash } from "node:crypto";
import { Keypair, StrKey, WebAuth } from "@stellar/stellar-sdk";
import { SignJWT, importPKCS8 } from "jose";
import { v, ConvexError, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { publicAuthAction } from "./lib/functions";
import { networkValidator, sessionResult } from "./lib/authValidators";
import { passphrase, verifyWalletProof } from "./lib/walletProof";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function config() {
  const {
    AUTH_PRIVATE_KEY,
    AUTH_ISSUER,
    AUTH_HOME_DOMAIN,
    STELLAR_AUTH_SECRET,
    AUTH_KEY_ID,
  } = process.env;
  if (
    !AUTH_PRIVATE_KEY ||
    !AUTH_ISSUER ||
    !AUTH_HOME_DOMAIN ||
    !STELLAR_AUTH_SECRET ||
    !AUTH_KEY_ID
  )
    throw new ConvexError("AUTH_NOT_CONFIGURED");
  return {
    privateKey: AUTH_PRIVATE_KEY,
    issuer: AUTH_ISSUER,
    homeDomain: AUTH_HOME_DOMAIN,
    webAuthDomain: new URL(AUTH_ISSUER).host,
    server: Keypair.fromSecret(STELLAR_AUTH_SECRET),
    kid: AUTH_KEY_ID,
  };
}
function validateRefreshToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ConvexError("SESSION_EXPIRED");
}
async function issueToken(
  session: {
    id: string;
    userId: string;
    wallet: string;
    network: "testnet" | "mainnet";
    expiresAt: number;
  },
  refreshToken: string,
) {
  const c = config();
  const expiresAt = Math.min(Date.now() + 60 * 60_000, session.expiresAt);
  const token = await new SignJWT({
    wallet: session.wallet,
    network: session.network,
    sessionId: session.id,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: c.kid })
    .setSubject(session.userId)
    .setIssuer(c.issuer)
    .setAudience("hacks")
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(await importPKCS8(c.privateKey, "RS256"));
  return {
    token,
    refreshToken,
    wallet: session.wallet,
    network: session.network,
    expiresAt,
    sessionExpiresAt: session.expiresAt,
  };
}
export const createChallenge = publicAuthAction({
  args: { wallet: v.string(), network: networkValidator },
  returns: v.object({
    nonce: v.string(),
    xdr: v.string(),
    networkPassphrase: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, { wallet, network }) => {
    if (!StrKey.isValidEd25519PublicKey(wallet))
      throw new ConvexError("INVALID_WALLET");
    const c = config();
    const nonce = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 5 * 60_000;
    const xdr = WebAuth.buildChallengeTx(
      c.server,
      wallet,
      c.homeDomain,
      300,
      passphrase(network),
      c.webAuthDomain,
    );
    await ctx.runMutation(internal.authData.storeChallenge, {
      wallet,
      network,
      nonce,
      xdr,
      expiresAt,
    });
    return { nonce, xdr, networkPassphrase: passphrase(network), expiresAt };
  },
});
export const verifyChallenge = publicAuthAction({
  args: { nonce: v.string(), signedXdr: v.string() },
  returns: sessionResult,
  handler: async (
    ctx,
    { nonce, signedXdr },
  ): Promise<Infer<typeof sessionResult>> => {
    if (!/^[a-f0-9]{64}$/.test(nonce) || signedXdr.length > 16_384)
      throw new ConvexError("INVALID_CHALLENGE");
    const c = config();
    const challenge = await ctx.runMutation(internal.authData.begin, { nonce });
    try {
      verifyWalletProof({
        storedXdr: challenge.xdr,
        signedXdr,
        wallet: challenge.wallet,
        network: challenge.network,
        serverPublicKey: c.server.publicKey(),
        homeDomain: c.homeDomain,
        webAuthDomain: c.webAuthDomain,
      });
    } catch {
      throw new ConvexError("INVALID_SIGNATURE");
    }
    const refreshToken = randomBytes(32).toString("hex");
    const session = await ctx.runMutation(internal.authData.complete, {
      challengeId: challenge.id,
      tokenHash: hash(refreshToken),
    });
    return issueToken(session, refreshToken);
  },
});
export const refresh = publicAuthAction({
  args: { refreshToken: v.string() },
  returns: sessionResult,
  handler: async (
    ctx,
    { refreshToken },
  ): Promise<Infer<typeof sessionResult>> => {
    validateRefreshToken(refreshToken);
    const session = await ctx.runQuery(internal.authData.session, {
      tokenHash: hash(refreshToken),
    });
    return issueToken(session, refreshToken);
  },
});
export const logout = publicAuthAction({
  args: { refreshToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { refreshToken }) => {
    validateRefreshToken(refreshToken);
    await ctx.runMutation(internal.authData.revoke, {
      tokenHash: hash(refreshToken),
    });
    return null;
  },
});
