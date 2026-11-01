import { spawnSync } from "node:child_process";
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import { Keypair } from "@stellar/stellar-sdk";
import { loadEnv } from "vite";
const HOME_DOMAIN = "hacks.mintedinpe.com";
const site = loadEnv("production", process.cwd(), "VITE_").VITE_CONVEX_SITE_URL;
if (!site || !/^https:\/\/[a-z0-9-]+\.convex\.site\/?$/.test(site))
  throw new Error(
    "Set VITE_CONVEX_SITE_URL in .env.production.local to the production https://<deployment>.convex.site URL.",
  );
// Secrets travel over stdin so they never appear in argv, logs or files.
function convex(args, input) {
  const result = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", ...args, "--prod"], {
    encoding: "utf8",
    input,
  });
  if (result.status !== 0)
    throw new Error(
      `Convex ${args.slice(0, 2).join(" ")} failed; secrets withheld. ${(result.stderr ?? String(result.error)).replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, "[redacted]")}`,
    );
  return result.stdout.trim();
}
const existing = convex(["env", "get", "AUTH_KEY_ID"]);
if (existing) {
  console.log(
    "Production auth keys already configured; preserving them. Rotate them deliberately instead of rerunning this script.",
  );
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
  AUTH_ISSUER: site.replace(/\/$/, ""),
  AUTH_HOME_DOMAIN: HOME_DOMAIN,
  AUTH_PRIVATE_KEY: await exportPKCS8(pair.privateKey),
  AUTH_PUBLIC_JWKS: JSON.stringify({ keys: [pub] }),
  STELLAR_AUTH_SECRET: Keypair.random().secret(),
};
// Mark configured last; a rerun repairs partial setup instead of accepting it.
for (const [name, value] of Object.entries(variables)) {
  convex(["env", "set", name], value);
  console.log(`Configured ${name}`);
}
convex(["env", "set", "AUTH_KEY_ID"], kid);
console.log(
  "Configured production authentication; no keys written to the workspace.",
);
