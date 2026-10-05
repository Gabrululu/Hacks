import type { GenericId } from "convex/values";
import type { MutationCtx } from "../lib/types";
export async function writeAudit(
  ctx: MutationCtx,
  actorId: GenericId<"users">,
  action: string,
  eventId?: GenericId<"events">,
  details?: {
    targetTable?: string;
    targetId?: string;
    data?: Record<string, string | number | boolean | null | string[]>;
  },
) {
  await ctx.db.insert("auditLog", {
    actorId,
    action,
    ...details,
    at: Date.now(),
    ...(eventId ? { eventId } : {}),
  });
}
