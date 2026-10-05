import { v } from "convex/values";
import { internalMutation } from "./lib/functions";
import * as auto from "./model/judgingAuto";
import * as ranking from "./model/judgingResults";
export const assign = internalMutation({
  args: {
    eventId: v.id("events"),
    roundId: v.id("judgingRounds"),
    revision: v.number(),
    cursor: v.union(v.null(), v.string()),
    judges: v.array(v.id("users")),
    perProject: v.number(),
    maxPerJudge: v.number(),
    trackId: v.optional(v.id("tracks")),
  },
  returns: v.null(),
  handler: (ctx, a) =>
    auto.batch(ctx, a.eventId, a.roundId, a.revision, a.cursor, {
      judges: a.judges,
      perProject: a.perProject,
      maxPerJudge: a.maxPerJudge,
      trackId: a.trackId,
    }),
});
export const results = internalMutation({
  args: {
    roundId: v.id("judgingRounds"),
    cursor: v.union(v.null(), v.string()),
    phase: v.union(v.literal("building"), v.literal("ranking")),
    nextRank: v.number(),
  },
  returns: v.null(),
  handler: (ctx, a) =>
    ranking.build(ctx, a.roundId, a.cursor, a.phase, a.nextRank),
});
