import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { api, internal } from "../convex/_generated/api";
// Trusted fixture for the anonymous local backend only. Uses its admin credential
// to create a temporary session for the already configured superadmin. No wallet
// private key is read, stored, or simulated. Always revoke the returned session.
export async function localAdminSession() {
  const env = readFileSync(".env.local", "utf8");
  const deployment = /^CONVEX_DEPLOYMENT=(.+)$/m.exec(env)?.[1]?.trim();
  const url = /^VITE_CONVEX_URL=(.+)$/m.exec(env)?.[1]?.trim();
  if (
    !deployment?.startsWith("anonymous:") ||
    process.env.CONVEX_DEPLOY_KEY ||
    !url ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
  )
    throw new Error(
      "Admin browser fixtures are only allowed on anonymous localhost.",
    );
  const wallet = execFileSync(
    "pnpm",
    ["exec", "convex", "env", "get", "SUPERADMIN_WALLETS"],
    { encoding: "utf8" },
  )
    .trim()
    .split(",")[0];
  if (!/^G[A-Z2-7]{55}$/.test(wallet))
    throw new Error(
      "Configure the real local superadmin before running this browser fixture.",
    );
  const config: {
    adminKey?: unknown;
    deploymentName?: unknown;
    ports?: { cloud?: unknown };
  } = JSON.parse(readFileSync(".convex/local/default/config.json", "utf8"));
  if (typeof config.adminKey !== "string")
    throw new Error("Local backend admin credential unavailable.");
  if (
    config.deploymentName !== deployment.slice("anonymous:".length) ||
    new URL(url).port !== String(config.ports?.cloud)
  )
    throw new Error(
      "Local admin configuration does not match the selected deployment.",
    );
  // These privileged methods exist at runtime but are intentionally omitted
  // from the SDK public-client declarations. Keep this adapter in local tests.
  type LocalAdminClient = {
    setAdminAuth(token: string): void;
    mutation<F extends FunctionReference<"mutation", "internal">>(
      reference: F,
      args: FunctionArgs<F>,
    ): Promise<FunctionReturnType<F>>;
  };
  const admin = new ConvexHttpClient(url) as unknown as LocalAdminClient;
  admin.setAdminAuth(config.adminKey);
  const nonce = randomBytes(32).toString("hex"),
    refreshToken = randomBytes(32).toString("hex");
  await admin.mutation(internal.authData.storeChallenge, {
    wallet,
    nonce,
    xdr: "trusted-local-browser-fixture",
    network: "testnet",
    expiresAt: Date.now() + 60000,
  });
  const challenge = await admin.mutation(internal.authData.begin, { nonce });
  await admin.mutation(internal.authData.complete, {
    challengeId: challenge.id,
    tokenHash: createHash("sha256").update(refreshToken).digest("hex"),
  });
  const client = new ConvexHttpClient(url);
  const session = await client.action(api.auth.refresh, { refreshToken });
  client.setAuth(session.token);
  const me = await client.query(api.users.me, {});
  if (me.platformRole !== "superadmin") {
    await client.action(api.auth.logout, { refreshToken });
    throw new Error("Fixture requires an already seeded superadmin.");
  }
  return {
    session,
    dispose: () => client.action(api.auth.logout, { refreshToken }),
  };
}
