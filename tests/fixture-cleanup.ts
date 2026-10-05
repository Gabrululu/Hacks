import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { internal } from "../convex/_generated/api";
const runId = randomUUID();
type LocalClient = {
  setAdminAuth(token: string): void;
  query<F extends FunctionReference<"query", "internal">>(
    reference: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
  mutation<F extends FunctionReference<"mutation", "internal">>(
    reference: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
};
function client() {
  const env = readFileSync(".env.local", "utf8"),
    deployment = /^CONVEX_DEPLOYMENT=(.+)$/m.exec(env)?.[1]?.trim(),
    url = /^VITE_CONVEX_URL=(.+)$/m.exec(env)?.[1]?.trim();
  if (
    !deployment?.startsWith("anonymous:") ||
    process.env.CONVEX_DEPLOY_KEY ||
    !url ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
  )
    throw Error("Cleanup only supports anonymous localhost.");
  const config = JSON.parse(
    readFileSync(".convex/local/default/config.json", "utf8"),
  );
  if (
    config.deploymentName !== deployment.slice(10) ||
    String(config.ports.cloud) !== new URL(url).port ||
    typeof config.adminKey !== "string"
  )
    throw Error("Local deployment mismatch.");
  const c = new ConvexHttpClient(url) as unknown as LocalClient;
  c.setAdminAuth(config.adminKey);
  return c;
}
export async function registerTestWallet(wallet: string) {
  await client().mutation(internal.testCleanup.registerWallet, {
    wallet,
    runId,
  });
}
export async function cleanupTests() {
  const c = client(),
    tables = await c.query(internal.testCleanup.tables, {});
  let cursor: string | null = null;
  do {
    const page: FunctionReturnType<typeof internal.testCleanup.inventory> =
      await c.query(internal.testCleanup.inventory, {
        paginationOpts: { numItems: 25, cursor },
      });
    for (const e of page.page) {
      await c.mutation(internal.testCleanup.markLegacy, { eventId: e.id });
      for (const table of [...tables, "events"]) {
        let more: boolean;
        do {
          const batch = await c.mutation(internal.testCleanup.removeBatch, {
            eventId: e.id,
            table,
          });
          more = batch.more;
        } while (more);
      }
    }
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  for (const id of [runId, "legacy"]) {
    let more: boolean;
    do {
      const batch = await c.mutation(internal.testCleanup.removeWalletBatch, {
        runId: id,
      });
      more = batch.more;
    } while (more);
  }
}
