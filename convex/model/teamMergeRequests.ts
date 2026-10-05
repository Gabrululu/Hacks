import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
export async function create(
  ctx: MutationCtx,
  team: Doc<"teams">,
  targetId: Id<"teams">,
  userId: Id<"users">,
) {
  return ctx.db.insert("teamMergeRequests", {
    eventId: team.eventId,
    sourceId: team._id,
    targetId,
    requestedBy: userId,
    status: "pending",
  });
}
export async function resolve(
  ctx: MutationCtx,
  id: Id<"teamMergeRequests">,
  status: "accepted" | "rejected",
) {
  await ctx.db.patch(id, { status });
}
