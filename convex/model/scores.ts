import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { rubricFor } from "../lib/judgingAccess";
import { normalizedScores } from "../lib/judgingMath";
import { markScored } from "./judgeAssignments";
import { writeAudit } from "./auditLog";
export async function save(
  ctx: MutationCtx,
  user: Doc<"users">,
  assignment: Doc<"judgeAssignments">,
  round: Doc<"judgingRounds">,
  criteria: Record<string, number>,
  privateNote: string,
  publicFeedback: string,
  revision: number,
) {
  if (assignment.status === "abstained")
    throw new ConvexError("JUDGE_ABSTAINED");
  if ((assignment.revision ?? 0) !== revision)
    throw new ConvexError("JUDGING_CONFLICT");
  if (privateNote.length > 4000 || publicFeedback.length > 4000)
    throw new ConvexError("INVALID_FEEDBACK");
  const rubric = await rubricFor(ctx, round),
    { total } = normalizedScores(rubric.criteria, criteria),
    row = await ctx.db
      .query("scores")
      .withIndex("by_event_assignment", (q) =>
        q.eq("eventId", assignment.eventId).eq("assignmentId", assignment._id),
      )
      .unique();
  const input = {
    eventId: assignment.eventId,
    roundId: assignment.roundId,
    assignmentId: assignment._id,
    submissionId: assignment.submissionId,
    judgeId: user._id,
    criteria,
    privateNote: privateNote.trim(),
    publicFeedback: publicFeedback.trim(),
    normalizedTotal: total,
    updatedAt: Date.now(),
    revision: (row?.revision ?? 0) + 1,
  };
  if (row) await ctx.db.patch(row._id, input);
  else await ctx.db.insert("scores", input);
  await markScored(ctx, assignment);
  await writeAudit(ctx, user._id, "judging.score", assignment.eventId, {
    targetTable: "judgeAssignments",
    targetId: assignment._id,
  });
  return null;
}
