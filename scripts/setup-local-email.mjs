import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const env = readFileSync(".env.local", "utf8");
const deployment = /^CONVEX_DEPLOYMENT=(.+)$/m.exec(env)?.[1]?.trim();
const site = /^VITE_CONVEX_SITE_URL=(.+)$/m.exec(env)?.[1]?.trim();
if (
  !deployment?.startsWith("anonymous:") ||
  process.env.CONVEX_DEPLOY_KEY ||
  !site ||
  !["localhost", "127.0.0.1"].includes(new URL(site).hostname)
)
  throw new Error(
    "Only the existing anonymous localhost deployment is supported.",
  );
function convex(args) {
  const result = spawnSync("pnpm", ["exec", "convex", ...args], {
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
