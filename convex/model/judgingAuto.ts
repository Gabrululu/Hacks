import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  roundFor,
  editableRound,
  eligibleJudge,
  conflict,
} from "../lib/judgingAccess";
import { assign } from "./judgeAssignments";
type Config = {
  judges: Id<"users">[];
  perProject: number;
  maxPerJudge: number;
  trackId?: Id<"tracks">;
};
export async function start(
  ctx: MutationCtx,
  eventId: Id<"events">,
  roundId: Id<"judgingRounds">,
  config: Config,
) {
  const { event, round } = await roundFor(ctx, eventId, roundId);
  editableRound(event, round);
  if (
    !config.judges.length ||
    config.judges.length > 20 ||
    new Set(config.judges).size !== config.judges.length ||
    !Number.isInteger(config.perProject) ||
    config.perProject < 1 ||
    config.perProject > 10 ||
    !Number.isInteger(config.maxPerJudge) ||
    config.maxPerJudge < 1 ||
    config.maxPerJudge > 100
  )
    throw new ConvexError("INVALID_ASSIGNMENT_CONFIG");
  for (const id of config.judges)
    if (!(await eligibleJudge(ctx, eventId, id)))
      throw new ConvexError("INVALID_JUDGE");
  if (config.trackId && (await ctx.db.get(config.trackId))?.eventId !== eventId)
    throw new ConvexError("INVALID_TRACK");
  if (
    event.status !== "published" ||
    Date.now() < event.timeline.submissionClosesAt ||
    Date.now() >= event.timeline.judgingClosesAt
  )
    throw new ConvexError("JUDGING_NOT_AVAILABLE");
  const revision = (round.autoRevision ?? 0) + 1;
  await ctx.db.patch(roundId, {
    autoState: "running",
    autoRevision: revision,
    autoError: undefined,
    autoUnfilled: 0,
    autoAssigned: 0,
  });
  await ctx.scheduler.runAfter(0, internal.judgingJobs.assign, {
    eventId,
    roundId,
    revision,
    cursor: null,
    ...config,
  });
  return null;
}
export async function cancel(
  ctx: MutationCtx,
  eventId: Id<"events">,
  roundId: Id<"judgingRounds">,
) {
  const { round } = await roundFor(ctx, eventId, roundId);
  if (round.autoState !== "running") throw new ConvexError("ROUND_LOCKED");
  await ctx.db.patch(roundId, {
    autoState: "cancelled",
    autoRevision: (round.autoRevision ?? 0) + 1,
  });
  return null;
}
export async function batch(
  ctx: MutationCtx,
  eventId: Id<"events">,
  roundId: Id<"judgingRounds">,
  revision: number,
  cursor: string | null,
  config: Config,
) {
  const round = await ctx.db.get(roundId),
    event = await ctx.db.get(eventId);
  if (!round || !event || round.eventId !== eventId) return null;
  if (round.autoRevision !== revision || round.autoState !== "running")
    return null;
  if (
    event.status !== "published" ||
    round.status !== "pending" ||
    event.judgingClosed ||
    event.resultsPublished
  ) {
    await ctx.db.patch(roundId, { autoState: "cancelled" });
    return null;
  }
  try {
    const page = await ctx.db
      .query("submissions")
      .withIndex("by_event_status", (q) =>
        q.eq("eventId", eventId).eq("status", "admitted"),
      )
      .paginate({ cursor, numItems: 1 });
    let unfilled = round.autoUnfilled ?? 0,
      added = round.autoAssigned ?? 0;
    for (const project of page.page) {
      if (config.trackId && !project.trackIds.includes(config.trackId))
        continue;
      const existing = await ctx.db
        .query("judgeAssignments")
        .withIndex("by_eventId_and_roundId_and_submissionId", (q) =>
          q
            .eq("eventId", eventId)
            .eq("roundId", roundId)
            .eq("submissionId", project._id),
        )
        .take(21);
      let missing =
        config.perProject -
        existing.filter((a) => a.status !== "abstained").length;
      const pool = [];
      for (const judgeId of config.judges) {
        if (
          existing.some((a) => a.judgeId === judgeId) ||
          !(await eligibleJudge(ctx, eventId, judgeId)) ||
          (await conflict(ctx, eventId, judgeId, project.teamId))
        )
          continue;
        const load = (
          await ctx.db
            .query("judgeAssignments")
            .withIndex("by_event_judge_round", (q) =>
              q
                .eq("eventId", eventId)
                .eq("judgeId", judgeId)
                .eq("roundId", roundId),
            )
            .take(101)
        ).length;
        if (load < config.maxPerJudge) pool.push({ judgeId, load });
      }
      pool.sort(
        (a, b) => a.load - b.load || a.judgeId.localeCompare(b.judgeId),
      );
      for (const row of pool) {
        if (missing-- <= 0) break;
        await assign(ctx, eventId, roundId, row.judgeId, project._id, true);
        added++;
      }
      if (missing > 0) unfilled++;
    }
    await ctx.db.patch(roundId, {
      autoUnfilled: unfilled,
      autoAssigned: added,
    });
    if (page.isDone) await ctx.db.patch(roundId, { autoState: "completed" });
    else
      await ctx.scheduler.runAfter(0, internal.judgingJobs.assign, {
        eventId,
        roundId,
        revision,
        cursor: page.continueCursor,
        ...config,
      });
  } catch {
    await ctx.db.patch(roundId, {
      autoState: "failed",
      autoError:
        "No se pudo completar la asignación. Revisa los plazos y reintenta; las asignaciones existentes se conservan.",
    });
  }
  return null;
}
