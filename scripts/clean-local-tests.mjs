import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
const env = readFileSync(".env.local", "utf8"),
  deployment = /^CONVEX_DEPLOYMENT=(.+)$/m.exec(env)?.[1]?.trim(),
  url = /^VITE_CONVEX_URL=(.+)$/m.exec(env)?.[1]?.trim();
if (
  !deployment?.startsWith("anonymous:") ||
  process.env.CONVEX_DEPLOY_KEY ||
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw Error("Only the existing anonymous localhost deployment is supported.");
const config = JSON.parse(
  readFileSync(".convex/local/default/config.json", "utf8"),
);
if (
  config.deploymentName !== deployment.slice(10) ||
  String(config.ports.cloud) !== new URL(url).port ||
  typeof config.adminKey !== "string"
)
  throw Error("Local deployment mismatch.");
const client = new ConvexHttpClient(url);
client.setAdminAuth(config.adminKey);
const tables = await client.query("testCleanup:tables", {});
let cursor = null,
  events = 0,
  records = 0;
do {
  const page = await client.query("testCleanup:inventory", {
    paginationOpts: { numItems: 25, cursor },
  });
  for (const e of page.page) {
    await client.mutation("testCleanup:markLegacy", { eventId: e.id });
    for (const table of [...tables, "events"]) {
      let more;
      do {
        const batch = await client.mutation("testCleanup:removeBatch", {
          eventId: e.id,
          table,
        });
        records += batch.removed;
        more = batch.more;
      } while (more);
    }
    events++;
  }
  cursor = page.isDone ? null : page.continueCursor;
} while (cursor);
const runIds = new Set(["legacy"]);
cursor = null;
do {
  const page = await client.query("testCleanup:runs", {
    paginationOpts: { numItems: 25, cursor },
  });
  for (const row of page.page) runIds.add(row.runId);
  cursor = page.isDone ? null : page.continueCursor;
} while (cursor);
for (const runId of runIds) {
  let more;
  do {
    const batch = await client.mutation("testCleanup:removeWalletBatch", {
      runId,
    });
    more = batch.more;
  } while (more);
}
console.log(
  `Removed ${events} verified browser-test events and ${records} associated records. Real user events were preserved.`,
);
