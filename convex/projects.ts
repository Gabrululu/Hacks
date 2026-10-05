import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  authedQuery,
  authedMutation,
  eventQuery,
  eventMutation,
} from "./lib/functions";
import { member, participant } from "./lib/projectAccess";
import { isEventOrganizer } from "./lib/permissions";
import {
  projectInput,
  projectStatus,
  projectView as viewValidator,
} from "./lib/projectValidators";
import { projectView } from "./lib/projectView";
import { field, answer } from "./lib/validators";
import { published } from "./model/forms";
import * as projects from "./model/submissions";
export const workspace = authedQuery({
  args: { teamId: v.id("teams") },
  returns: v.object({
    eventId: v.id("events"),
    project: v.union(v.null(), viewValidator),
    fields: v.array(field),
    formId: v.optional(v.id("forms")),
    formVersion: v.number(),
    tracks: v.array(v.object({ id: v.id("tracks"), name: v.string() })),
    opensAt: v.number(),
    closesAt: v.number(),
    startsAt: v.number(),
    requiredCheckpoints: v.number(),
    teamSizeMin: v.number(),
    teamSizeMax: v.number(),
  }),
  handler: async (ctx, a) => {
    const { team, event } = await member(ctx, ctx.user, a.teamId),
      row = await ctx.db
        .query("submissions")
        .withIndex("by_event_team", (q) =>
          q.eq("eventId", team.eventId).eq("teamId", a.teamId),
        )
        .unique(),
      form = row ? null : await published(ctx, team.eventId, "submission"),
      tracks = await ctx.db
        .query("tracks")
        .withIndex("by_event", (q) => q.eq("eventId", team.eventId))
        .take(50);
    return {
      eventId: team.eventId,
      project: row ? await projectView(ctx, row, true) : null,
      fields: row?.fieldSnapshot ?? form?.fields ?? [],
      formId: row?.formId ?? form?._id,
      formVersion: row?.formVersion ?? form?.version ?? 0,
      tracks: tracks.map((t) => ({ id: t._id, name: t.name })),
      startsAt: event.timeline.startsAt,
      opensAt: event.timeline.submissionOpensAt,
      closesAt: event.timeline.submissionClosesAt,
      requiredCheckpoints: event.settings.requiredCheckpoints,
      teamSizeMin: event.settings.teamSizeMin,
      teamSizeMax: event.settings.teamSizeMax,
    };
  },
});
export const save = authedMutation({
  args: {
    teamId: v.id("teams"),
    expectedRevision: v.number(),
    ...projectInput,
    answers: v.record(v.string(), answer),
  },
  returns: v.id("submissions"),
  handler: (ctx, a) => {
    const { teamId, expectedRevision, answers, ...input } = a;
    return projects.save(
      ctx,
      ctx.user,
      teamId,
      input,
      answers,
      expectedRevision,
    );
  },
});
export const submit = authedMutation({
  args: { id: v.id("submissions"), expectedRevision: v.number() },
  returns: v.null(),
  handler: (ctx, a) => projects.submit(ctx, ctx.user, a.id, a.expectedRevision),
});
export const list = eventQuery("submissions.view")({
  args: {
    status: v.optional(projectStatus),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(viewValidator),
  handler: async (ctx, a) => {
    const result = await ctx.db
        .query("submissions")
        .withIndex("by_event_status", (q) =>
          a.status
            ? q.eq("eventId", a.eventId).eq("status", a.status)
            : q.eq("eventId", a.eventId),
        )
        .paginate({ ...a.paginationOpts, numItems: 20 }),
      organizer = await isEventOrganizer(ctx, ctx.user, a.eventId);
    return {
      ...result,
      page: await Promise.all(
        result.page.map((r) => projectView(ctx, r, organizer)),
      ),
    };
  },
});
export const review = eventMutation(
  "submissions.review",
  "project.review",
)({
  args: {
    id: v.id("submissions"),
    status: v.union(v.literal("admitted"), v.literal("disqualified")),
    reason: v.string(),
    expectedRevision: v.number(),
  },
  returns: v.null(),
  handler: (ctx, a) =>
    projects.review(
      ctx,
      ctx.user,
      a.eventId,
      a.id,
      a.status,
      a.reason,
      a.expectedRevision,
    ),
});
export const history = authedQuery({
  args: { teamId: v.id("teams"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      id: v.id("submissionVersions"),
      version: v.number(),
      submittedAt: v.number(),
      ...projectInput,
      formVersion: v.number(),
      fields: v.array(field),
      answers: v.record(v.string(), answer),
    }),
  ),
  handler: async (ctx, a) => {
    const { team } = await member(ctx, ctx.user, a.teamId);
    await participant(ctx, ctx.user, team.eventId);
    const result = await ctx.db
      .query("submissionVersions")
      .withIndex("by_eventId_and_teamId", (q) =>
        q.eq("eventId", team.eventId).eq("teamId", a.teamId),
      )
      .order("desc")
      .paginate({ ...a.paginationOpts, numItems: 10 });
    return {
      ...result,
      page: result.page.map((r) => ({
        id: r._id,
        version: r.version,
        submittedAt: r.submittedAt,
        title: r.title,
        summary: r.summary,
        trackIds: r.trackIds,
        repoUrl: r.repoUrl,
        demoUrl: r.demoUrl,
        videoUrl: r.videoUrl,
        contractId: r.contractId,
        imageIds: r.imageIds,
        formVersion: r.formVersion,
        fields: r.fieldSnapshot,
        answers: r.answers,
      })),
    };
  },
});
