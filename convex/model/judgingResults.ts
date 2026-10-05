import { results as notifyResults } from "./campaigns";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { roundFor, rubricFor } from "../lib/judgingAccess";
import { normalizedScores } from "../lib/judgingMath";
export async function closeRound(
  ctx: MutationCtx,
  eventId: Id<"events">,
  roundId: Id<"judgingRounds">,
  revision: number,
  force: boolean,
) {
  const { round, event } = await roundFor(ctx, eventId, roundId);
  if (
    event.status !== "published" ||
    event.resultsPublished ||
    round.status !== "open" ||
    round.autoState === "running"
  )
    throw new ConvexError("ROUND_LOCKED");
  if ((round.revision ?? 0) !== revision)
    throw new ConvexError("JUDGING_CONFLICT");
  const pending = await ctx.db
    .query("judgeAssignments")
    .withIndex("by_eventId_and_roundId_and_status", (q) =>
      q.eq("eventId", eventId).eq("roundId", roundId).eq("status", "assigned"),
    )
    .first();
  if (pending && !force) throw new ConvexError("EVALUATIONS_PENDING");
  await ctx.db.patch(roundId, {
    status: "closed",
    closedAt: Date.now(),
    revision: revision + 1,
    resultsState: "building",
    resultsError: undefined,
  });
  await ctx.scheduler.runAfter(0, internal.judgingJobs.results, {
    roundId,
    cursor: null,
    phase: "building",
    nextRank: 1,
  });
  return null;
}
export async function retry(
  ctx: MutationCtx,
  eventId: Id<"events">,
  roundId: Id<"judgingRounds">,
) {
  const { round, event } = await roundFor(ctx, eventId, roundId);
  if (
    round.status !== "closed" ||
    round.resultsState !== "failed" ||
    event.resultsPublished
  )
    throw new ConvexError("ROUND_LOCKED");
  await ctx.db.patch(roundId, {
    resultsState: "building",
    resultsError: undefined,
  });
  await ctx.scheduler.runAfter(0, internal.judgingJobs.results, {
    roundId,
    cursor: null,
    phase: "building",
    nextRank: 1,
  });
  return null;
}
async function calculate(
  ctx: MutationCtx,
  round: Doc<"judgingRounds">,
  entry: Doc<"roundProjects">,
) {
  const assignments = await ctx.db
    .query("judgeAssignments")
    .withIndex("by_eventId_and_roundId_and_submissionId", (q) =>
      q
        .eq("eventId", round.eventId)
        .eq("roundId", round._id)
        .eq("submissionId", entry.submissionId),
    )
    .take(21);
  if (assignments.length > 20) throw new ConvexError("PROJECT_JUDGE_LIMIT");
  const rubric = await rubricFor(ctx, round),
    version = await ctx.db.get(entry.versionId),
    project = await ctx.db.get(entry.submissionId);
  if (!version || !project || project.status !== "admitted")
    throw new ConvexError("PROJECT_NOT_ADMITTED");
  let reviews = 0,
    sum = 0,
    tie = 0,
    abstentions = 0,
    pending = 0;
  const publicFeedback: string[] = [];
  for (const a of assignments) {
    if (a.status === "abstained") {
      abstentions++;
      continue;
    }
    if (a.status !== "scored") {
      pending++;
      continue;
    }
    const score = await ctx.db
      .query("scores")
      .withIndex("by_event_assignment", (q) =>
        q.eq("eventId", round.eventId).eq("assignmentId", a._id),
      )
      .unique();
    const judge = await ctx.db.get(a.judgeId);
    if (!score || !judge || judge.suspendedAt !== undefined) {
      pending++;
      continue;
    }
    const value = normalizedScores(rubric.criteria, score.criteria);
    reviews++;
    sum += value.total;
    if (round.tieBreakCriterion)
      tie += value.normalized[round.tieBreakCriterion];
    if (score.publicFeedback?.trim())
      publicFeedback.push(score.publicFeedback.trim());
  }
  const input = {
    eventId: round.eventId,
    roundId: round._id,
    submissionId: project._id,
    title: version.title,
    summary: version.summary,
    teamName: (await ctx.db.get(version.teamId))?.name ?? "Equipo",
    score: reviews ? Math.round((sum / reviews) * 1000000) / 1000000 : 0,
    tieScore: reviews ? Math.round((tie / reviews) * 1000000) / 1000000 : 0,
    tieTime: -version.submittedAt,
    reviews,
    abstentions,
    pending,
    eligible: reviews >= (round.minReviews ?? 1),
    rank: undefined,
    publicFeedback,
  };
  const current = await ctx.db
    .query("judgingResults")
    .withIndex("by_eventId_and_roundId_and_submissionId", (q) =>
      q
        .eq("eventId", round.eventId)
        .eq("roundId", round._id)
        .eq("submissionId", project._id),
    )
    .unique();
  if (current) await ctx.db.patch(current._id, input);
  else await ctx.db.insert("judgingResults", input);
}
export async function build(
  ctx: MutationCtx,
  roundId: Id<"judgingRounds">,
  cursor: string | null,
  phase: "building" | "ranking",
  nextRank: number,
) {
  const round = await ctx.db.get(roundId);
  if (!round || round.status !== "closed" || round.resultsState !== phase)
    return null;
  try {
    if (phase === "building") {
      const page = await ctx.db
        .query("roundProjects")
        .withIndex("by_eventId_and_roundId_and_submissionId", (q) =>
          q.eq("eventId", round.eventId).eq("roundId", roundId),
        )
        .paginate({ cursor, numItems: 5 });
      for (const entry of page.page) await calculate(ctx, round, entry);
      if (!page.isDone)
        await ctx.scheduler.runAfter(0, internal.judgingJobs.results, {
          roundId,
          cursor: page.continueCursor,
          phase,
          nextRank,
        });
      else {
        await ctx.db.patch(roundId, { resultsState: "ranking" });
        await ctx.scheduler.runAfter(0, internal.judgingJobs.results, {
          roundId,
          cursor: null,
          phase: "ranking",
          nextRank: 1,
        });
      }
    } else {
      const page = await ctx.db
        .query("judgingResults")
        .withIndex("by_eventId_roundId_eligible_score_tieScore_tieTime", (q) =>
          q
            .eq("eventId", round.eventId)
            .eq("roundId", roundId)
            .eq("eligible", true),
        )
        .order("desc")
        .paginate({ cursor, numItems: 20 });
      let rank = nextRank;
      for (const entry of page.page)
        await ctx.db.patch(entry._id, { rank: rank++ });
      if (!page.isDone)
        await ctx.scheduler.runAfter(0, internal.judgingJobs.results, {
          roundId,
          cursor: page.continueCursor,
          phase,
          nextRank: rank,
        });
      else await ctx.db.patch(roundId, { resultsState: "ready" });
    }
  } catch {
    await ctx.db.patch(roundId, {
      resultsState: "failed",
      resultsError:
        "No se pudo generar el ranking. Revisa las entregas y reintenta.",
    });
  }
  return null;
}
export async function closeEvent(ctx: MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event || event.status !== "published" || event.resultsPublished)
    throw new ConvexError("JUDGING_CLOSED");
  const rounds = await ctx.db
    .query("judgingRounds")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(9);
  if (
    !rounds.length ||
    rounds.some((r) => r.status !== "closed" || r.resultsState !== "ready")
  )
    throw new ConvexError("ROUNDS_NOT_CLOSED");
  await ctx.db.patch(eventId, { judgingClosed: true });
  return null;
}
export async function publish(
  ctx: MutationCtx,
  eventId: Id<"events">,
  roundId: Id<"judgingRounds">,
  winnerCount: number,
) {
  const { event, round } = await roundFor(ctx, eventId, roundId);
  if (
    event.status !== "published" ||
    !event.judgingClosed ||
    round.resultsState !== "ready" ||
    round.status !== "closed" ||
    !Number.isInteger(winnerCount) ||
    winnerCount < 1 ||
    winnerCount > 20
  )
    throw new ConvexError("RESULTS_NOT_READY");
  if (event.resultsPublished) {
    if (event.finalRoundId === roundId && event.winnerCount === winnerCount)
      return null;
    throw new ConvexError("RESULTS_ALREADY_PUBLISHED");
  }
  const rounds = await ctx.db
    .query("judgingRounds")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(9);
  if (rounds.some((r) => r.order > round.order))
    throw new ConvexError("FINAL_ROUND_REQUIRED");
  const winners = await ctx.db
    .query("judgingResults")
    .withIndex("by_eventId_and_roundId_and_eligible_and_rank", (q) =>
      q.eq("eventId", eventId).eq("roundId", roundId).eq("eligible", true),
    )
    .take(winnerCount);
  if (winners.length < winnerCount) throw new ConvexError("NOT_ENOUGH_RESULTS");
  await ctx.db.patch(eventId, {
    resultsPublished: true,
    finalRoundId: roundId,
    winnerCount,
    publicPhase: "results",
    registrationOpen: false,
    phaseRevision: (event.phaseRevision ?? 0) + 1,
  });
  await notifyResults(ctx, (await ctx.db.get(eventId))!);
  return null;
}
