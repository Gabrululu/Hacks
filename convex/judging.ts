import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { doc } from "convex-helpers/validators";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import schema from "./schema";
import {
  eventQuery,
  eventMutation,
  authedQuery,
  authedMutation,
  publicQuery,
} from "./lib/functions";
import { can, isEventOrganizer } from "./lib/permissions";
import {
  roundFor,
  rubricFor,
  ownAssignment,
  scoringOpen,
} from "./lib/judgingAccess";
import { criterion, publicResult } from "./lib/judgingValidators";
import { projectInput } from "./lib/projectValidators";
import { field, answer } from "./lib/validators";
import { visibleAnswers } from "./lib/formEngine";
import * as rounds from "./model/judgingRounds";
import * as assignments from "./model/judgeAssignments";
import * as scores from "./model/scores";
import * as results from "./model/judgingResults";
import * as auto from "./model/judgingAuto";
const managementPermissions = [
  "judges.manage",
  "judging.assign",
  "judging.close",
  "results.publish",
] as const;
export const setup = eventQuery(managementPermissions)({
  args: {},
  returns: v.object({
    rounds: v.array(
      v.object({
        round: doc(schema, "judgingRounds"),
        criteria: v.array(criterion),
      }),
    ),
    judges: v.array(v.object({ id: v.id("users"), name: v.string() })),
    tracks: v.array(v.object({ id: v.id("tracks"), name: v.string() })),
  }),
  handler: async (ctx, a) => {
    const rows = await ctx.db
        .query("judgingRounds")
        .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
        .take(8),
      staff = await ctx.db
        .query("eventStaff")
        .withIndex("by_event_and_revokedAt", (q) =>
          q.eq("eventId", a.eventId).eq("revokedAt", undefined),
        )
        .take(101),
      judges = [];
    for (const id of new Set(staff.map((s) => s.userId))) {
      const user = await ctx.db.get(id);
      if (
        user &&
        user.suspendedAt === undefined &&
        (await can(ctx, user, a.eventId, "judging.score"))
      )
        judges.push({ id, name: user.name ?? "Juez" });
    }
    const tracks = await ctx.db
      .query("tracks")
      .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
      .take(50);
    return {
      rounds: await Promise.all(
        rows
          .sort((a, b) => a.order - b.order)
          .map(async (round) => ({
            round,
            criteria: (await rubricFor(ctx, round)).criteria,
          })),
      ),
      judges,
      tracks: tracks.map((t) => ({ id: t._id, name: t.name })),
    };
  },
});
export const saveRound = eventMutation(
  "judges.manage",
  "judging.round_save",
)({
  args: {
    id: v.optional(v.id("judgingRounds")),
    name: v.string(),
    order: v.number(),
    criteria: v.array(criterion),
    minReviews: v.number(),
    tieBreakCriterion: v.optional(v.string()),
    expectedRevision: v.number(),
  },
  returns: v.id("judgingRounds"),
  handler: (ctx, a) =>
    rounds.save(
      ctx,
      a.eventId,
      a.id,
      a.name,
      a.order,
      a.criteria,
      a.minReviews,
      a.tieBreakCriterion,
      a.expectedRevision,
    ),
});
export const openRound = eventMutation(
  "judging.assign",
  "judging.round_open",
)({
  args: { roundId: v.id("judgingRounds"), expectedRevision: v.number() },
  returns: v.null(),
  handler: (ctx, a) =>
    rounds.open(ctx, a.eventId, a.roundId, a.expectedRevision),
});
export const assign = eventMutation(
  "judging.assign",
  "judging.assign",
)({
  args: {
    roundId: v.id("judgingRounds"),
    judgeId: v.id("users"),
    submissionId: v.id("submissions"),
  },
  returns: v.id("judgeAssignments"),
  handler: (ctx, a) =>
    assignments.assign(ctx, a.eventId, a.roundId, a.judgeId, a.submissionId),
});
export const removeAssignment = eventMutation(
  "judging.assign",
  "judging.assignment_remove",
)({
  args: { id: v.id("judgeAssignments") },
  returns: v.null(),
  handler: (ctx, a) => assignments.remove(ctx, a.eventId, a.id),
});
export const autoAssign = eventMutation(
  "judging.assign",
  "judging.auto_assign",
)({
  args: {
    roundId: v.id("judgingRounds"),
    judges: v.array(v.id("users")),
    perProject: v.number(),
    maxPerJudge: v.number(),
    trackId: v.optional(v.id("tracks")),
  },
  returns: v.null(),
  handler: (ctx, a) =>
    auto.start(ctx, a.eventId, a.roundId, {
      judges: a.judges,
      perProject: a.perProject,
      maxPerJudge: a.maxPerJudge,
      trackId: a.trackId,
    }),
});
export const cancelAuto = eventMutation(
  "judging.assign",
  "judging.auto_cancel",
)({
  args: { roundId: v.id("judgingRounds") },
  returns: v.null(),
  handler: (ctx, a) => auto.cancel(ctx, a.eventId, a.roundId),
});
export const listAssignments = eventQuery("judging.assign")({
  args: {
    roundId: v.id("judgingRounds"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      assignment: doc(schema, "judgeAssignments"),
      title: v.string(),
      judgeName: v.string(),
      score: v.union(v.null(), v.number()),
      privateNote: v.union(v.null(), v.string()),
      publicFeedback: v.union(v.null(), v.string()),
    }),
  ),
  handler: async (ctx, a) => {
    await roundFor(ctx, a.eventId, a.roundId);
    const organizer = await isEventOrganizer(ctx, ctx.user, a.eventId),
      page = await ctx.db
        .query("judgeAssignments")
        .withIndex("by_event_round", (q) =>
          q.eq("eventId", a.eventId).eq("roundId", a.roundId),
        )
        .paginate({ ...a.paginationOpts, numItems: 20 });
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (assignment) => {
          const score = await ctx.db
            .query("scores")
            .withIndex("by_event_assignment", (q) =>
              q.eq("eventId", a.eventId).eq("assignmentId", assignment._id),
            )
            .unique();
          return {
            assignment,
            title:
              (await ctx.db.get(assignment.submissionId))?.title ?? "Proyecto",
            judgeName: (await ctx.db.get(assignment.judgeId))?.name ?? "Juez",
            score: score?.normalizedTotal ?? null,
            privateNote: organizer ? (score?.privateNote ?? null) : null,
            publicFeedback: score?.publicFeedback ?? null,
          };
        }),
      ),
    };
  },
});
export const myAssignments = eventQuery("judging.score")({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      id: v.id("judgeAssignments"),
      title: v.string(),
      roundName: v.string(),
      status: v.string(),
      revision: v.number(),
      roundStatus: v.string(),
      position: v.number(),
      total: v.number(),
    }),
  ),
  handler: async (ctx, a) => {
    // A judge can receive at most 100 assignments in each of at most eight
    // rounds. Read that bounded set so a stable judge-specific ordering can
    // be applied before pagination rather than shuffling each page separately.
    const rows = await ctx.db
      .query("judgeAssignments")
      .withIndex("by_event_judge_round", (q) =>
        q.eq("eventId", a.eventId).eq("judgeId", ctx.user._id),
      )
      .take(801);
    if (rows.length > 800) throw new ConvexError("JUDGE_ASSIGNMENT_LIMIT");

    const rounds = new Map<string, Doc<"judgingRounds"> | null>();
    await Promise.all(
      [...new Set(rows.map((row) => row.roundId))].map(async (roundId) => {
        rounds.set(roundId, await ctx.db.get(roundId));
      }),
    );
    const ordered = await Promise.all(
      rows.map(async (row) => {
        let hash = 0x811c9dc5;
        const seed = `${row.roundId}:${ctx.user._id}:${row.submissionId}`;
        for (let i = 0; i < seed.length; i++) {
          hash ^= seed.charCodeAt(i);
          hash = Math.imul(hash, 0x01000193);
        }
        const round = rounds.get(row.roundId) ?? null;
        return {
          row,
          round,
          project: await ctx.db.get(row.submissionId),
          orderKey: hash >>> 0,
        };
      }),
    );
    ordered.sort(
      (left, right) =>
        (left.round?.order ?? 0) - (right.round?.order ?? 0) ||
        left.orderKey - right.orderKey ||
        String(left.row._id).localeCompare(String(right.row._id)),
    );

    const offset = Math.max(
        0,
        Math.min(
          ordered.length,
          a.paginationOpts.cursor && /^\d+$/.test(a.paginationOpts.cursor)
            ? Number(a.paginationOpts.cursor)
            : 0,
        ),
      ),
      pageSize = Math.max(1, Math.min(100, a.paginationOpts.numItems)),
      end = Math.min(ordered.length, offset + pageSize),
      page = ordered.slice(offset, end);
    return {
      continueCursor: String(end),
      isDone: end >= ordered.length,
      page: page.map(({ row, project, round }, index) => ({
        id: row._id,
        title: project?.title ?? "Proyecto",
        roundName: round?.name ?? "Ronda",
        status: row.status,
        revision: row.revision ?? 0,
        roundStatus: round?.status ?? "closed",
        position: offset + index + 1,
        total: ordered.length,
      })),
    };
  },
});
export const assignment = authedQuery({
  args: { id: v.id("judgeAssignments") },
  returns: v.object({
    assignment: doc(schema, "judgeAssignments"),
    criteria: v.array(criterion),
    roundName: v.string(),
    roundStatus: v.string(),
    closed: v.boolean(),
    deadline: v.number(),
    project: v.object({
      ...projectInput,
      versionId: v.id("submissionVersions"),
      fields: v.array(field),
      answers: v.record(v.string(), answer),
    }),
    score: v.union(
      v.null(),
      v.object({
        criteria: v.record(v.string(), v.number()),
        privateNote: v.string(),
        publicFeedback: v.string(),
      }),
    ),
  }),
  handler: async (ctx, a) => {
    const { assignment, event, round } = await ownAssignment(
        ctx,
        ctx.user,
        a.id,
      ),
      version = assignment.versionId
        ? await ctx.db.get(assignment.versionId)
        : null;
    if (!version) throw Error("PROJECT_VERSION_MISSING");
    const rubric = await rubricFor(ctx, round),
      score = await ctx.db
        .query("scores")
        .withIndex("by_event_assignment", (q) =>
          q.eq("eventId", event._id).eq("assignmentId", a.id),
        )
        .unique();
    return {
      assignment,
      criteria: rubric.criteria,
      roundName: round.name,
      roundStatus: round.status,
      closed: event.judgingClosed || event.resultsPublished,
      deadline: event.timeline.judgingClosesAt,
      project: {
        title: version.title,
        summary: version.summary,
        trackIds: version.trackIds,
        repoUrl: version.repoUrl,
        demoUrl: version.demoUrl,
        videoUrl: version.videoUrl,
        contractId: version.contractId,
        imageIds: version.imageIds,
        versionId: version._id,
        ...visibleAnswers(version.fieldSnapshot, version.answers, false),
      },
      score: score
        ? {
            criteria: score.criteria,
            privateNote: score.privateNote ?? "",
            publicFeedback: score.publicFeedback ?? "",
          }
        : null,
    };
  },
});
export const saveScore = authedMutation({
  args: {
    id: v.id("judgeAssignments"),
    criteria: v.record(v.string(), v.number()),
    privateNote: v.string(),
    publicFeedback: v.string(),
    expectedRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const { assignment, event, round } = await ownAssignment(
      ctx,
      ctx.user,
      a.id,
    );
    scoringOpen(event, round);
    return scores.save(
      ctx,
      ctx.user,
      assignment,
      round,
      a.criteria,
      a.privateNote,
      a.publicFeedback,
      a.expectedRevision,
    );
  },
});
export const abstain = authedMutation({
  args: {
    id: v.id("judgeAssignments"),
    reason: v.string(),
    expectedRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const { assignment, event, round } = await ownAssignment(
      ctx,
      ctx.user,
      a.id,
    );
    scoringOpen(event, round);
    return assignments.abstain(
      ctx,
      ctx.user,
      assignment,
      a.reason,
      a.expectedRevision,
    );
  },
});
export const closeRound = eventMutation(
  "judging.close",
  "judging.round_close",
)({
  args: {
    roundId: v.id("judgingRounds"),
    expectedRevision: v.number(),
    force: v.boolean(),
  },
  returns: v.null(),
  handler: (ctx, a) =>
    results.closeRound(ctx, a.eventId, a.roundId, a.expectedRevision, a.force),
});
export const retryResults = eventMutation(
  "judging.close",
  "judging.results_retry",
)({
  args: { roundId: v.id("judgingRounds") },
  returns: v.null(),
  handler: (ctx, a) => results.retry(ctx, a.eventId, a.roundId),
});
export const closeEvent = eventMutation(
  "judging.close",
  "judging.close",
)({
  args: {},
  returns: v.null(),
  handler: (ctx, a) => results.closeEvent(ctx, a.eventId),
});
export const publish = eventMutation(
  "results.publish",
  "results.publish",
)({
  args: { roundId: v.id("judgingRounds"), winnerCount: v.number() },
  returns: v.null(),
  handler: (ctx, a) =>
    results.publish(ctx, a.eventId, a.roundId, a.winnerCount),
});
function resultView(r: import("./_generated/dataModel").Doc<"judgingResults">) {
  return {
    id: r._id,
    submissionId: r.submissionId,
    title: r.title,
    summary: r.summary,
    teamName: r.teamName,
    rank: r.rank ?? null,
    score: r.score,
    reviews: r.reviews,
    abstentions: r.abstentions,
    pending: r.pending,
    eligible: r.eligible,
    publicFeedback: r.publicFeedback,
  };
}
export const ranking = eventQuery(managementPermissions)({
  args: {
    roundId: v.id("judgingRounds"),
    eligible: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(publicResult),
  handler: async (ctx, a) => {
    const { round } = await roundFor(ctx, a.eventId, a.roundId);
    if (round.resultsState !== "ready")
      return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db
      .query("judgingResults")
      .withIndex("by_eventId_and_roundId_and_eligible_and_rank", (q) =>
        q
          .eq("eventId", a.eventId)
          .eq("roundId", a.roundId)
          .eq("eligible", a.eligible),
      )
      .paginate({ ...a.paginationOpts, numItems: 20 });
    return { ...page, page: page.page.map(resultView) };
  },
});
export const publicRanking = publicQuery({
  args: { slug: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({
    eventName: v.union(v.null(), v.string()),
    roundName: v.union(v.null(), v.string()),
    winnerCount: v.number(),
    page: paginationResultValidator(publicResult),
  }),
  handler: async (ctx, a) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", a.slug))
      .unique();
    if (
      !event ||
      event.status !== "published" ||
      !event.resultsPublished ||
      !event.finalRoundId
    )
      return {
        eventName: null,
        roundName: null,
        winnerCount: 0,
        page: { page: [], isDone: true, continueCursor: "" },
      };
    const round = await ctx.db.get(event.finalRoundId);
    const page = await ctx.db
      .query("judgingResults")
      .withIndex("by_eventId_and_roundId_and_eligible_and_rank", (q) =>
        q
          .eq("eventId", event._id)
          .eq("roundId", event.finalRoundId!)
          .eq("eligible", true),
      )
      .paginate({ ...a.paginationOpts, numItems: 20 });
    return {
      eventName: event.name,
      roundName: round?.name ?? "Final",
      winnerCount: event.winnerCount ?? 0,
      page: { ...page, page: page.page.map(resultView) },
    };
  },
});
export const candidates = eventQuery("judging.assign")({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      id: v.id("submissions"),
      title: v.string(),
      teamName: v.string(),
    }),
  ),
  handler: async (ctx, a) => {
    const page = await ctx.db
      .query("submissions")
      .withIndex("by_event_status", (q) =>
        q.eq("eventId", a.eventId).eq("status", "admitted"),
      )
      .paginate({ ...a.paginationOpts, numItems: 20 });
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (p) => ({
          id: p._id,
          title: p.title,
          teamName: (await ctx.db.get(p.teamId))?.name ?? "Equipo",
        })),
      ),
    };
  },
});
