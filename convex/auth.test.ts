// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { expect, test, beforeAll, afterAll, vi } from "vitest";
import { Keypair, Transaction, Networks } from "@stellar/stellar-sdk";
import { generateKeyPair, exportPKCS8, jwtVerify } from "jose";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
let publicKey: Awaited<ReturnType<typeof generateKeyPair>>["publicKey"];
beforeAll(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  publicKey = keys.publicKey;
  vi.stubEnv("AUTH_PRIVATE_KEY", await exportPKCS8(keys.privateKey));
  vi.stubEnv("AUTH_KEY_ID", "test-key");
  vi.stubEnv("AUTH_ISSUER", "https://hacks.test");
  vi.stubEnv("AUTH_HOME_DOMAIN", "hacks.test");
  vi.stubEnv("STELLAR_AUTH_SECRET", Keypair.random().secret());
});
afterAll(() => vi.unstubAllEnvs());
function signed(xdr: string, wallet: Keypair, network = Networks.TESTNET) {
  const tx = new Transaction(xdr, network);
  tx.sign(wallet);
  return tx.toXDR();
}
async function login() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  const wallet = Keypair.random();
  const challenge = await t.action(api.auth.createChallenge, {
    wallet: wallet.publicKey(),
    network: "testnet",
  });
  const result = await t.action(api.auth.verifyChallenge, {
    nonce: challenge.nonce,
    signedXdr: signed(challenge.xdr, wallet),
  });
  const { payload } = await jwtVerify(result.token, publicKey, {
    issuer: "https://hacks.test",
    audience: "hacks",
  });
  return {
    t,
    wallet,
    challenge,
    result,
    payload,
    authed: t.withIdentity({
      issuer: payload.iss!,
      subject: payload.sub!,
      tokenIdentifier: `${payload.iss}|${payload.sub}`,
      sessionId: payload.sessionId as string,
    }),
  };
}
test("signed SEP-10 challenge emits a valid RS256 JWT and authenticated user", async () => {
  const { result, payload, authed, wallet, t } = await login();
  expect(payload.wallet).toBe(wallet.publicKey());
  expect(payload.aud).toBe("hacks");
  expect(result.sessionExpiresAt - result.expiresAt).toBeGreaterThan(
    6 * 24 * 60 * 60_000,
  );
  expect(await authed.query(api.users.me, {})).toMatchObject({
    wallet: wallet.publicKey(),
    platformRole: "user",
  });
  const stored = await t.run((ctx) => ctx.db.query("authSessions").first());
  expect(stored?.tokenHash).not.toBe(result.refreshToken);
});
test("a consumed challenge cannot be replayed", async () => {
  const { t, challenge, wallet } = await login();
  await expect(
    t.action(api.auth.verifyChallenge, {
      nonce: challenge.nonce,
      signedXdr: signed(challenge.xdr, wallet),
    }),
  ).rejects.toThrow("INVALID_CHALLENGE");
});
test("rejects unsigned challenge and wrong wallet signature", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  const wallet = Keypair.random();
  const challenge = await t.action(api.auth.createChallenge, {
    wallet: wallet.publicKey(),
    network: "testnet",
  });
  await expect(
    t.action(api.auth.verifyChallenge, {
      nonce: challenge.nonce,
      signedXdr: challenge.xdr,
    }),
  ).rejects.toThrow("INVALID_SIGNATURE");
  await expect(
    t.action(api.auth.verifyChallenge, {
      nonce: challenge.nonce,
      signedXdr: signed(challenge.xdr, Keypair.random()),
    }),
  ).rejects.toThrow("INVALID_SIGNATURE");
});
test("cannot substitute another valid challenge or sign on the wrong network", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  const wallet = Keypair.random();
  const first = await t.action(api.auth.createChallenge, {
    wallet: wallet.publicKey(),
    network: "testnet",
  });
  const second = await t.action(api.auth.createChallenge, {
    wallet: wallet.publicKey(),
    network: "testnet",
  });
  await expect(
    t.action(api.auth.verifyChallenge, {
      nonce: first.nonce,
      signedXdr: signed(second.xdr, wallet),
    }),
  ).rejects.toThrow("INVALID_SIGNATURE");
  await expect(
    t.action(api.auth.verifyChallenge, {
      nonce: first.nonce,
      signedXdr: signed(first.xdr, wallet, Networks.PUBLIC),
    }),
  ).rejects.toThrow("INVALID_SIGNATURE");
});
test("expired challenge is refused", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  const wallet = Keypair.random();
  const challenge = await t.action(api.auth.createChallenge, {
    wallet: wallet.publicKey(),
    network: "testnet",
  });
  await t.run(async (ctx) => {
    const c = await ctx.db
      .query("authChallenges")
      .withIndex("by_nonce", (q) => q.eq("nonce", challenge.nonce))
      .unique();
    await ctx.db.patch(c!._id, { expiresAt: Date.now() - 1 });
  });
  await expect(
    t.action(api.auth.verifyChallenge, {
      nonce: challenge.nonce,
      signedXdr: signed(challenge.xdr, wallet),
    }),
  ).rejects.toThrow("INVALID_CHALLENGE");
});
test("challenge creation and invalid verification attempts are rate limited", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  const wallet = Keypair.random().publicKey();
  const c = await t.action(api.auth.createChallenge, {
    wallet,
    network: "testnet",
  });
  await t.action(api.auth.createChallenge, { wallet, network: "testnet" });
  await t.action(api.auth.createChallenge, { wallet, network: "testnet" });
  await expect(
    t.action(api.auth.createChallenge, { wallet, network: "testnet" }),
  ).rejects.toThrow("RATE_LIMITED");
  for (let i = 0; i < 5; i++)
    await expect(
      t.action(api.auth.verifyChallenge, { nonce: c.nonce, signedXdr: c.xdr }),
    ).rejects.toThrow("INVALID_SIGNATURE");
  await expect(
    t.action(api.auth.verifyChallenge, { nonce: c.nonce, signedXdr: c.xdr }),
  ).rejects.toThrow("RATE_LIMITED");
});
test("refresh works and logout immediately revokes access and refresh", async () => {
  const { t, result, authed } = await login();
  expect(
    await t.action(api.auth.refresh, { refreshToken: result.refreshToken }),
  ).toMatchObject({
    wallet: result.wallet,
    sessionExpiresAt: result.sessionExpiresAt,
  });
  await t.action(api.auth.logout, { refreshToken: result.refreshToken });
  await expect(
    t.action(api.auth.refresh, { refreshToken: result.refreshToken }),
  ).rejects.toThrow("SESSION_EXPIRED");
  await expect(authed.query(api.users.me, {})).rejects.toThrow(
    "SESSION_EXPIRED",
  );
});
test("suspension prevents refresh and future login", async () => {
  const { t, result, authed, wallet } = await login();
  const me = await authed.query(api.users.me, {});
  await t.run((ctx) => ctx.db.patch(me.id, { suspendedAt: Date.now() }));
  await expect(
    t.action(api.auth.refresh, { refreshToken: result.refreshToken }),
  ).rejects.toThrow("ACCOUNT_SUSPENDED");
  const c = await t.action(api.auth.createChallenge, {
    wallet: wallet.publicKey(),
    network: "testnet",
  });
  await expect(
    t.action(api.auth.verifyChallenge, {
      nonce: c.nonce,
      signedXdr: signed(c.xdr, wallet),
    }),
  ).rejects.toThrow("ACCOUNT_SUSPENDED");
});
test("login preserves an existing seeded platform role and rejects malformed wallets", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  const wallet = Keypair.random();
  await t.run((ctx) =>
    ctx.db.insert("users", {
      wallet: wallet.publicKey(),
      platformRole: "superadmin",
    }),
  );
  const c = await t.action(api.auth.createChallenge, {
    wallet: wallet.publicKey(),
    network: "mainnet",
  });
  const result = await t.action(api.auth.verifyChallenge, {
    nonce: c.nonce,
    signedXdr: signed(c.xdr, wallet, Networks.PUBLIC),
  });
  const { payload } = await jwtVerify(result.token, publicKey, {
    issuer: "https://hacks.test",
    audience: "hacks",
  });
  const authed = t.withIdentity({
    issuer: payload.iss!,
    subject: payload.sub!,
    sessionId: payload.sessionId as string,
  });
  expect(await authed.query(api.users.me, {})).toMatchObject({
    platformRole: "superadmin",
  });
  await expect(
    t.action(api.auth.createChallenge, { wallet: "GFAKE", network: "testnet" }),
  ).rejects.toThrow("INVALID_WALLET");
});
test("expired sessions cannot refresh or access authenticated queries", async () => {
  const { t, result, payload, authed } = await login();
  await t.run((ctx) =>
    ctx.db.patch(
      payload.sessionId as import("./_generated/dataModel").Id<"authSessions">,
      { expiresAt: Date.now() - 1 },
    ),
  );
  await expect(
    t.action(api.auth.refresh, { refreshToken: result.refreshToken }),
  ).rejects.toThrow("SESSION_EXPIRED");
  await expect(authed.query(api.users.me, {})).rejects.toThrow(
    "SESSION_EXPIRED",
  );
});
test("a signed identity cannot attach another user session", async () => {
  const { t, payload } = await login();
  await t.run((ctx) =>
    ctx.db.insert("users", {
      wallet: Keypair.random().publicKey(),
      platformRole: "user",
      tokenIdentifier: "https://hacks.test|stranger",
    }),
  );
  const wrong = t.withIdentity({
    issuer: "https://hacks.test",
    subject: "stranger",
    tokenIdentifier: "https://hacks.test|stranger",
    sessionId: payload.sessionId as string,
  });
  await expect(wrong.query(api.users.me, {})).rejects.toThrow(
    "SESSION_EXPIRED",
  );
});
