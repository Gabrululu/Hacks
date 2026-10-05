import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import schema from "./schema";
import {
  authedQuery,
  authedMutation,
  eventQuery,
  eventMutation,
} from "./lib/functions";
import { member } from "./lib/projectAccess";
import { isEventOrganizer } from "./lib/permissions";
import { answer } from "./lib/validators";
import { checkpointResponse } from "./lib/projectValidators";
import { checkpointView } from "./lib/projectView";
import * as definitions from "./model/checkpoints";
import * as responses from "./model/checkpointSubmissions";
export const editor = eventQuery("event.edit")({
  args: {},
  returns: v.array(doc(schema, "checkpoints")),
  handler: (ctx, a) =>
    ctx.db
      .query("checkpoints")
      .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
      .take(52),
});
export const save = eventMutation(
  "event.edit",
  "checkpoint.save",
)({
  args: {
    id: v.optional(v.id("checkpoints")),
    title: v.string(),
    description: v.string(),
    dueAt: v.number(),
    order: v.number(),
    expectedRevision: v.number(),
  },
  returns: v.id("checkpoints"),
  handler: (ctx, a) =>
    definitions.save(
      ctx,
      a.eventId,
      a.id,
      a.title,
      a.description,
      a.dueAt,
      a.order,
      a.expectedRevision,
    ),
});
export const remove = eventMutation(
  "event.edit",
  "checkpoint.remove",
)({
  args: { id: v.id("checkpoints") },
  returns: v.null(),
  handler: (ctx, a) => definitions.remove(ctx, a.eventId, a.id),
});
export const mine = authedQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(
    v.object({
      checkpoint: doc(schema, "checkpoints"),
      response: v.union(v.null(), checkpointResponse),
    }),
  ),
  handler: async (ctx, a) => {
    const { team } = await member(ctx, ctx.user, a.teamId),
      cps = await ctx.db
        .query("checkpoints")
        .withIndex("by_event", (q) => q.eq("eventId", team.eventId))
        .take(52);
    return Promise.all(
      cps
        .sort((a, b) => a.order - b.order)
        .map(async (checkpoint) => {
          const r = await ctx.db
            .query("checkpointSubmissions")
            .withIndex("by_eventId_and_teamId_and_checkpointId", (q) =>
              q
                .eq("eventId", team.eventId)
                .eq("teamId", a.teamId)
                .eq("checkpointId", checkpoint._id),
            )
            .unique();
          return {
            checkpoint,
            response: r ? await checkpointView(ctx, r, true) : null,
          };
        }),
    );
  },
});
export const submit = authedMutation({
  args: {
    teamId: v.id("teams"),
    checkpointId: v.id("checkpoints"),
    answers: v.record(v.string(), answer),
    expectedRevision: v.number(),
  },
  returns: v.id("checkpointSubmissions"),
  handler: (ctx, a) =>
    responses.submit(
      ctx,
      ctx.user,
      a.teamId,
      a.checkpointId,
      a.answers,
      a.expectedRevision,
    ),
});
export const list = eventQuery("submissions.view")({
  args: {
    checkpointId: v.optional(v.id("checkpoints")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(checkpointResponse),
  handler: async (ctx, a) => {
    const result = await ctx.db
        .query("checkpointSubmissions")
        .withIndex("by_event_checkpoint", (q) =>
          a.checkpointId
            ? q.eq("eventId", a.eventId).eq("checkpointId", a.checkpointId)
            : q.eq("eventId", a.eventId),
        )
        .paginate({ ...a.paginationOpts, numItems: 20 }),
      organizer = await isEventOrganizer(ctx, ctx.user, a.eventId);
    return {
      ...result,
      page: await Promise.all(
        result.page.map((r) => checkpointView(ctx, r, organizer)),
      ),
    };
  },
});
export const review = eventMutation(
  "submissions.review",
  "checkpoint.review",
)({
  args: {
    id: v.id("checkpointSubmissions"),
    status: v.union(v.literal("accepted"), v.literal("rejected")),
    reason: v.string(),
    expectedRevision: v.number(),
  },
  returns: v.null(),
  handler: (ctx, a) =>
    responses.review(
      ctx,
      ctx.user,
      a.eventId,
      a.id,
      a.status,
      a.reason,
      a.expectedRevision,
    ),
});
