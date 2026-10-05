import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
export async function add(
  ctx: MutationCtx,
  eventId: Id<"events">,
  teamId: Id<"teams">,
  userId: Id<"users">,
) {
  return ctx.db.insert("teamMembers", {
    eventId,
    teamId,
    userId,
    joinedAt: Date.now(),
  });
}
export async function remove(ctx: MutationCtx, id: Id<"teamMembers">) {
  await ctx.db.delete(id);
}
export async function move(
  ctx: MutationCtx,
  id: Id<"teamMembers">,
  teamId: Id<"teams">,
) {
  await ctx.db.patch(id, { teamId });
}
