import { spawnSync } from "node:child_process";
import { loadEnv } from "vite";
// Production builds read .env.production.local, which overrides the local
// development URLs in .env.local.
const env = loadEnv("production", process.cwd(), "VITE_");
const checks = [
  ["VITE_CONVEX_URL", /^https:\/\/[a-z0-9-]+\.convex\.cloud\/?$/],
  ["VITE_CONVEX_SITE_URL", /^https:\/\/[a-z0-9-]+\.convex\.site\/?$/],
];
for (const [name, pattern] of checks)
  if (!pattern.test(env[name] ?? ""))
    throw new Error(
      `${name} in .env.production.local must be the production Convex URL.`,
    );
if (env.VITE_CONVEX_URL.replace(".convex.cloud", "") !== env.VITE_CONVEX_SITE_URL.replace(".convex.site", ""))
  throw new Error("VITE_CONVEX_URL and VITE_CONVEX_SITE_URL point to different deployments.");
// In CI the deploy key selects the Convex deployment; it must match the URLs
// baked into the frontend.
const deployKey = process.env.CONVEX_DEPLOY_KEY;
const deployment = new URL(env.VITE_CONVEX_URL).hostname.split(".")[0];
if (deployKey && !deployKey.startsWith(`prod:${deployment}|`))
  throw new Error(`CONVEX_DEPLOY_KEY is not a production key for ${deployment}.`);
if (!env.VITE_WALLETCONNECT_PROJECT_ID)
  console.warn("VITE_WALLETCONNECT_PROJECT_ID is empty; WalletConnect will be hidden.");
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Backend first, so the new frontend never calls functions that are not live.
run("pnpm", ["exec", "convex", "deploy"]);
run("pnpm", ["build"]);
run("pnpm", [
  "exec",
  "wrangler",
  "deploy",
  "--var",
  `CONVEX_URL:${env.VITE_CONVEX_URL.replace(/\/$/, "")}`,
]);
