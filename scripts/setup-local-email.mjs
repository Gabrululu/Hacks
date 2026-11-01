import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const env = readFileSync(".env.local", "utf8");
// Convex appends "# team: ..., project: ..." to cloud deployments.
const deployment = /^CONVEX_DEPLOYMENT=([^#\s]+)/m.exec(env)?.[1];
const site = /^VITE_CONVEX_SITE_URL=(.+)$/m.exec(env)?.[1]?.trim();
// Development only: an anonymous localhost backend or a cloud dev deployment.
const isLocal =
  deployment?.startsWith("anonymous:") &&
  site &&
  ["localhost", "127.0.0.1"].includes(new URL(site).hostname);
const isCloudDev =
  deployment?.startsWith("dev:") &&
  site === `https://${deployment.slice(4)}.convex.site`;
if ((!isLocal && !isCloudDev) || process.env.CONVEX_DEPLOY_KEY)
  throw new Error(
    "Only development deployments (anonymous local or cloud dev) are supported.",
  );
function convex(args) {
  const result = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", ...args], {
    encoding: "utf8",
    env: { ...process.env, CONVEX_DEPLOYMENT: deployment },
  });
  if (result.status !== 0)
    throw new Error("Local email configuration failed; secrets withheld.");
  return result.stdout.trim();
}
const existing = convex(["env", "get", "EMAIL_VERIFICATION_SECRET"]);
if (!existing)
  convex([
    "env",
    "set",
    `EMAIL_VERIFICATION_SECRET=${randomBytes(32).toString("hex")}`,
  ]);
convex(["env", "set", "EMAIL_DELIVERY_MODE=development"]);
console.log(
  `Development mailbox enabled on ${deployment}. No real emails will be sent.`,
);
