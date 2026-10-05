import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { validateCriteria, type Criterion } from "../lib/judgingMath";
import {
  roundFor,
  editableRound,
  rubricFor,
  freezeEvent,
} from "../lib/judgingAccess";
export async function save(
  ctx: MutationCtx,
  eventId: Id<"events">,
  id: Id<"judgingRounds"> | undefined,
  name: string,
  order: number,
  criteria: Criterion[],
  minReviews: number,
  tieBreakCriterion: string | undefined,
  revision: number,
) {
  const event = await ctx.db.get(eventId);
  if (
    !event ||
    event.status === "archived" ||
    event.judgingClosed ||
    event.resultsPublished
  )
    throw new ConvexError("JUDGING_CLOSED");
  validateCriteria(criteria);
  if (
    !name.trim() ||
    name.length > 120 ||
    !Number.isInteger(order) ||
    order < 0 ||
    order > 100 ||
    !Number.isInteger(minReviews) ||
    minReviews < 1 ||
    minReviews > 10 ||
    (tieBreakCriterion && !criteria.some((c) => c.id === tieBreakCriterion))
  )
    throw new ConvexError("INVALID_ROUND");
  const current = id ? (await roundFor(ctx, eventId, id)).round : null;
  if (current) editableRound(event, current);
  if ((current?.revision ?? 0) !== revision)
    throw new ConvexError("JUDGING_CONFLICT");
  const rounds = await ctx.db
    .query("judgingRounds")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(9);
  if (!id && rounds.length >= 8) throw new ConvexError("ROUND_LIMIT");
  if (rounds.some((r) => r._id !== id && r.order === order))
    throw new ConvexError("ROUND_ORDER_TAKEN");
  const args = {
    eventId,
    name: name.trim(),
    order,
    minReviews,
    tieBreakCriterion,
    revision: revision + 1,
  };
  const roundId =
    id ??
    (await ctx.db.insert("judgingRounds", { ...args, status: "pending" }));
  if (id) await ctx.db.patch(id, args);
  const rubric = current ? await rubricFor(ctx, current) : null;
  if (rubric)
    await ctx.db.patch(rubric._id, {
      criteria,
      revision: (rubric.revision ?? 0) + 1,
    });
  else
    await ctx.db.insert("rubrics", { eventId, roundId, criteria, revision: 1 });
  return roundId;
}
export async function open(
  ctx: MutationCtx,
  eventId: Id<"events">,
  roundId: Id<"judgingRounds">,
  revision: number,
) {
  const { round, event } = await roundFor(ctx, eventId, roundId);
  editableRound(event, round);
  if ((round.revision ?? 0) !== revision)
    throw new ConvexError("JUDGING_CONFLICT");
  if (
    event.status !== "published" ||
    Date.now() < event.timeline.submissionClosesAt ||
    Date.now() >= event.timeline.judgingClosesAt
  )
    throw new ConvexError("JUDGING_NOT_AVAILABLE");
  await rubricFor(ctx, round);
  const rounds = await ctx.db
    .query("judgingRounds")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(9);
  if (
    rounds.some(
      (r) =>
        r._id !== roundId &&
        (r.status === "open" ||
          (r.order < round.order &&
            (r.status !== "closed" || r.resultsState !== "ready"))),
    )
  )
    throw new ConvexError("PREVIOUS_ROUND_OPEN");
  if (
    !(await ctx.db
      .query("roundProjects")
      .withIndex("by_eventId_and_roundId_and_submissionId", (q) =>
        q.eq("eventId", eventId).eq("roundId", roundId),
      )
      .first())
  )
    throw new ConvexError("ASSIGNMENTS_REQUIRED");
  await freezeEvent(ctx, event);
  await ctx.db.patch(roundId, {
    status: "open",
    openedAt: Date.now(),
    revision: revision + 1,
  });
  return null;
}
