import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import { Keypair } from "@stellar/stellar-sdk";
const contents = readFileSync(".env.local", "utf8");
const deployment = /^CONVEX_DEPLOYMENT=(.+)$/m.exec(contents)?.[1]?.trim();
if (!deployment?.startsWith("anonymous:") || process.env.CONVEX_DEPLOY_KEY)
  throw new Error(
    "This script only configures the existing anonymous local deployment.",
  );
const site = /^VITE_CONVEX_SITE_URL=(.+)$/m.exec(contents)?.[1]?.trim();
if (!site || !["localhost", "127.0.0.1"].includes(new URL(site).hostname))
  throw new Error("Expected a localhost Convex site URL");
function convex(args) {
  const result = spawnSync("pnpm", ["exec", "convex", ...args], {
    encoding: "utf8",
    env: { ...process.env, CONVEX_DEPLOYMENT: deployment },
  });
  if (result.status !== 0)
    throw new Error(
      `Convex ${args[0]} failed; secrets withheld. ${result.stderr.replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, "[redacted]")}`,
    );
  return result.stdout.trim();
}
const existing = convex(["env", "get", "AUTH_KEY_ID"]);
if (existing) {
  console.log("Local auth keys already configured; preserving them.");
  process.exit(0);
}
const pair = await generateKeyPair("RS256", { extractable: true });
const kid = crypto.randomUUID();
const pub = {
  ...(await exportJWK(pair.publicKey)),
  use: "sig",
  alg: "RS256",
  kid,
};
const variables = {
  AUTH_ISSUER: site,
  AUTH_HOME_DOMAIN: "localhost:5173",
  AUTH_KEY_ID: kid,
  AUTH_PRIVATE_KEY: await exportPKCS8(pair.privateKey),
  AUTH_PUBLIC_JWKS: JSON.stringify({ keys: [pub] }),
  STELLAR_AUTH_SECRET: Keypair.random().secret(),
};
// Mark configured last; a rerun repairs partial setup instead of accepting it.
for (const [name, value] of Object.entries(variables).filter(
  ([name]) => name !== "AUTH_KEY_ID",
)) {
  convex(["env", "set", `${name}=${value}`]);
  console.log(`Configured ${name}`);
}
convex(["env", "set", `AUTH_KEY_ID=${kid}`]);
console.log(
  `Configured authentication on ${deployment}; no keys written to the workspace.`,
);
