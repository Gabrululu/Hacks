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
import { member, participant, roster } from "./lib/projectAccess";
import * as teams from "./model/teams";
const teamSummary = v.object({
  id: v.id("teams"),
  name: v.string(),
  description: v.string(),
  memberCount: v.number(),
  lookingForMembers: v.boolean(),
});
export const mine = authedQuery({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      team: doc(schema, "teams"),
      locked: v.boolean(),
      members: v.array(
        v.object({
          id: v.id("teamMembers"),
          userId: v.id("users"),
          name: v.string(),
        }),
      ),
      outgoing: v.union(
        v.null(),
        v.object({ id: v.id("teamMergeRequests"), targetName: v.string() }),
      ),
      requests: v.array(
        v.object({
          id: v.id("teamMergeRequests"),
          sourceId: v.id("teams"),
          sourceName: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, a) => {
    await participant(ctx, ctx.user, a.eventId);
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", a.eventId).eq("userId", ctx.user._id),
      )
      .unique();
    if (!membership) return null;
    const { team } = await member(ctx, ctx.user, membership.teamId),
      members = await roster(ctx, team);
    const requests =
      team.leaderId === ctx.user._id
        ? await ctx.db
            .query("teamMergeRequests")
            .withIndex("by_eventId_and_targetId_and_status", (q) =>
              q
                .eq("eventId", a.eventId)
                .eq("targetId", team._id)
                .eq("status", "pending"),
            )
            .take(20)
        : [];
    const outgoing =
      team.leaderId === ctx.user._id
        ? await ctx.db
            .query("teamMergeRequests")
            .withIndex("by_eventId_and_sourceId_and_status", (q) =>
              q
                .eq("eventId", a.eventId)
                .eq("sourceId", team._id)
                .eq("status", "pending"),
            )
            .first()
        : null;
    return {
      outgoing: outgoing
        ? {
            id: outgoing._id,
            targetName: (await ctx.db.get(outgoing.targetId))?.name ?? "Equipo",
          }
        : null,
      team,
      locked:
        (
          await ctx.db
            .query("submissions")
            .withIndex("by_event_team", (q) =>
              q.eq("eventId", a.eventId).eq("teamId", team._id),
            )
            .unique()
        )?.submittedAt !== undefined,
      members: await Promise.all(
        members.map(async (m) => ({
          id: m._id,
          userId: m.userId,
          name: (await ctx.db.get(m.userId))?.name ?? "Builder",
        })),
      ),
      requests: await Promise.all(
        requests.map(async (r) => ({
          id: r._id,
          sourceId: r.sourceId,
          sourceName: (await ctx.db.get(r.sourceId))?.name ?? "Equipo",
        })),
      ),
    };
  },
});
export const find = authedQuery({
  args: { eventId: v.id("events"), search: v.string() },
  returns: v.array(teamSummary),
  handler: async (ctx, a) => {
    await participant(ctx, ctx.user, a.eventId);
    const search = a.search.trim().slice(0, 100);
    const rows = search
      ? await ctx.db
          .query("teams")
          .withSearchIndex("search_name", (q) =>
            q
              .search("name", search)
              .eq("eventId", a.eventId)
              .eq("lookingForMembers", true)
              .eq("active", true),
          )
          .take(20)
      : await ctx.db
          .query("teams")
          .withIndex("by_eventId_and_lookingForMembers_and_active", (q) =>
            q
              .eq("eventId", a.eventId)
              .eq("lookingForMembers", true)
              .eq("active", true),
          )
          .take(20);
    return Promise.all(
      rows.map(async (t) => ({
        id: t._id,
        name: t.name,
        description: t.description ?? "",
        memberCount: t.memberCount ?? (await roster(ctx, t)).length,
        lookingForMembers: t.lookingForMembers,
      })),
    );
  },
});
export const create = authedMutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    description: v.string(),
    lookingForMembers: v.boolean(),
  },
  returns: v.id("teams"),
  handler: (ctx, a) =>
    teams.create(
      ctx,
      ctx.user,
      a.eventId,
      a.name,
      a.description,
      a.lookingForMembers,
    ),
});
export const join = authedMutation({
  args: { eventId: v.id("events"), code: v.string() },
  returns: v.id("teams"),
  handler: (ctx, a) => teams.join(ctx, ctx.user, a.eventId, a.code),
});
export const update = authedMutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    description: v.string(),
    lookingForMembers: v.boolean(),
  },
  returns: v.null(),
  handler: (ctx, a) =>
    teams.update(
      ctx,
      ctx.user,
      a.teamId,
      a.name,
      a.description,
      a.lookingForMembers,
    ),
});
export const removeMember = authedMutation({
  args: { teamId: v.id("teams"), memberId: v.id("teamMembers") },
  returns: v.null(),
  handler: (ctx, a) => teams.removeMember(ctx, ctx.user, a.teamId, a.memberId),
});
export const transfer = authedMutation({
  args: { teamId: v.id("teams"), memberId: v.id("teamMembers") },
  returns: v.null(),
  handler: (ctx, a) => teams.transfer(ctx, ctx.user, a.teamId, a.memberId),
});
export const requestMerge = authedMutation({
  args: { sourceId: v.id("teams"), targetId: v.id("teams") },
  returns: v.id("teamMergeRequests"),
  handler: (ctx, a) =>
    teams.requestMerge(ctx, ctx.user, a.sourceId, a.targetId),
});
export const resolveMerge = authedMutation({
  args: { id: v.id("teamMergeRequests"), accept: v.boolean() },
  returns: v.null(),
  handler: (ctx, a) => teams.resolveMerge(ctx, ctx.user, a.id, a.accept),
});
export const list = eventQuery("teams.manage")({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(teamSummary),
  handler: async (ctx, a) => {
    const result = await ctx.db
      .query("teams")
      .withIndex("by_eventId_and_active", (q) =>
        q.eq("eventId", a.eventId).eq("active", true),
      )
      .paginate({ ...a.paginationOpts, numItems: 25 });
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (t) => ({
          id: t._id,
          name: t.name,
          description: t.description ?? "",
          memberCount: t.memberCount ?? (await roster(ctx, t)).length,
          lookingForMembers: t.lookingForMembers,
        })),
      ),
    };
  },
});
export const mergeStaff = eventMutation(
  "teams.manage",
  "team.merge_staff",
)({
  args: { sourceId: v.id("teams"), targetId: v.id("teams") },
  returns: v.null(),
  handler: (ctx, a) =>
    teams.merge(ctx, ctx.user, a.sourceId, a.targetId, a.eventId),
});

export const cancelMerge = authedMutation({
  args: { id: v.id("teamMergeRequests") },
  returns: v.null(),
  handler: (ctx, a) => teams.cancelMerge(ctx, ctx.user, a.id),
});
