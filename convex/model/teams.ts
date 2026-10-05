import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { member, participant, roster, unlocked } from "../lib/projectAccess";
import * as members from "./teamMembers";
import * as requests from "./teamMergeRequests";
import { propagate } from "./checkpointSubmissions";
import { moveUploads } from "./projectUploads";
import { moveForTeamMerge as moveMentorBookings } from "./mentorBookings";
import { writeAudit } from "./auditLog";
function details(name: string, description: string) {
  if (name.trim().length < 3 || name.length > 80 || description.length > 1000)
    throw new ConvexError("INVALID_TEAM");
}
function leader(team: Doc<"teams">, user: Doc<"users">) {
  if (team.leaderId !== user._id) throw new ConvexError("TEAM_LEADER_REQUIRED");
}
export async function create(
  ctx: MutationCtx,
  user: Doc<"users">,
  eventId: Id<"events">,
  name: string,
  description: string,
  lookingForMembers: boolean,
) {
  const event = await participant(ctx, user, eventId);
  if (Date.now() >= event.timeline.submissionClosesAt)
    throw new ConvexError("TEAMS_CLOSED");
  details(name, description);
  if (
    await ctx.db
      .query("teamMembers")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("userId", user._id),
      )
      .unique()
  )
    throw new ConvexError("ALREADY_IN_TEAM");
  const joinCode = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 12)
    .toUpperCase();
  if (
    await ctx.db
      .query("teams")
      .withIndex("by_join_code", (q) => q.eq("joinCode", joinCode))
      .unique()
  )
    throw new ConvexError("RETRY_JOIN_CODE");
  const id = await ctx.db.insert("teams", {
    eventId,
    name: name.trim(),
    description: description.trim(),
    lookingForMembers,
    leaderId: user._id,
    joinCode,
    active: true,
    memberCount: 1,
  });
  await members.add(ctx, eventId, id, user._id);
  await writeAudit(ctx, user._id, "team.create", eventId, {
    targetTable: "teams",
    targetId: id,
  });
  return id;
}
export async function join(
  ctx: MutationCtx,
  user: Doc<"users">,
  eventId: Id<"events">,
  code: string,
) {
  const event = await participant(ctx, user, eventId),
    team = await ctx.db
      .query("teams")
      .withIndex("by_join_code", (q) =>
        q.eq("joinCode", code.trim().toUpperCase()),
      )
      .unique();
  if (
    !team ||
    team.eventId !== eventId ||
    team.active === false ||
    team.mergedInto
  )
    throw new ConvexError("INVALID_JOIN_CODE");
  await unlocked(ctx, team);
  if (
    await ctx.db
      .query("teamMembers")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", eventId).eq("userId", user._id),
      )
      .unique()
  )
    throw new ConvexError("ALREADY_IN_TEAM");
  const count = (await roster(ctx, team)).length;
  if (count >= event.settings.teamSizeMax) throw new ConvexError("TEAM_FULL");
  await members.add(ctx, eventId, team._id, user._id);
  await ctx.db.patch(team._id, { memberCount: count + 1 });
  await writeAudit(ctx, user._id, "team.join", eventId, {
    targetTable: "teams",
    targetId: team._id,
  });
  return team._id;
}
export async function update(
  ctx: MutationCtx,
  user: Doc<"users">,
  id: Id<"teams">,
  name: string,
  description: string,
  lookingForMembers: boolean,
) {
  const { team } = await member(ctx, user, id);
  leader(team, user);
  await unlocked(ctx, team);
  details(name, description);
  await ctx.db.patch(id, {
    name: name.trim(),
    description: description.trim(),
    lookingForMembers,
  });
  await writeAudit(ctx, user._id, "team.update", team.eventId, {
    targetTable: "teams",
    targetId: id,
  });
  return null;
}
export async function removeMember(
  ctx: MutationCtx,
  user: Doc<"users">,
  teamId: Id<"teams">,
  memberId: Id<"teamMembers">,
) {
  const { team } = await member(ctx, user, teamId);
  await unlocked(ctx, team);
  const row = await ctx.db.get(memberId);
  if (!row || row.teamId !== teamId || row.eventId !== team.eventId)
    throw new ConvexError("NOT_FOUND");
  if (row.userId !== user._id) leader(team, user);
  const all = await roster(ctx, team);
  if (row.userId === team.leaderId && all.length > 1)
    throw new ConvexError("TRANSFER_LEADERSHIP_FIRST");
  await members.remove(ctx, memberId);
  await ctx.db.patch(teamId, {
    memberCount: all.length - 1,
    ...(all.length === 1 ? { active: false, lookingForMembers: false } : {}),
  });
  await writeAudit(ctx, user._id, "team.member_removed", team.eventId, {
    targetTable: "teams",
    targetId: teamId,
  });
  return null;
}
export async function transfer(
  ctx: MutationCtx,
  user: Doc<"users">,
  teamId: Id<"teams">,
  memberId: Id<"teamMembers">,
) {
  const { team } = await member(ctx, user, teamId);
  leader(team, user);
  await unlocked(ctx, team);
  const row = await ctx.db.get(memberId);
  if (!row || row.teamId !== teamId || row.eventId !== team.eventId)
    throw new ConvexError("NOT_FOUND");
  const next = await ctx.db.get(row.userId);
  if (!next) throw new ConvexError("NOT_FOUND");
  await participant(ctx, next, team.eventId);
  await ctx.db.patch(teamId, { leaderId: row.userId });
  await writeAudit(ctx, user._id, "team.transfer", team.eventId, {
    targetTable: "teams",
    targetId: teamId,
  });
  return null;
}
export async function merge(
  ctx: MutationCtx,
  user: Doc<"users">,
  sourceId: Id<"teams">,
  targetId: Id<"teams">,
  eventId: Id<"events">,
) {
  if (sourceId === targetId) throw new ConvexError("INVALID_MERGE");
  const source = await ctx.db.get(sourceId),
    target = await ctx.db.get(targetId);
  if (
    !source ||
    !target ||
    source.eventId !== eventId ||
    target.eventId !== eventId ||
    source.active === false ||
    target.active === false ||
    source.mergedInto ||
    target.mergedInto
  )
    throw new ConvexError("INVALID_MERGE");
  await unlocked(ctx, source);
  await unlocked(ctx, target);
  const a = await roster(ctx, source),
    b = await roster(ctx, target),
    event = (await ctx.db.get(eventId))!;
  if (a.length + b.length > event.settings.teamSizeMax)
    throw new ConvexError("TEAM_FULL");
  for (const m of [...a, ...b]) {
    const u = await ctx.db.get(m.userId);
    if (!u || u.suspendedAt !== undefined)
      throw new ConvexError("REGISTRATION_NOT_APPROVED");
    await participant(ctx, u, eventId);
  }
  await moveUploads(ctx, eventId, sourceId, targetId);
  await propagate(ctx, eventId, sourceId, targetId);
  await moveMentorBookings(ctx, eventId, sourceId, targetId, user._id);
  for (const row of a) await members.move(ctx, row._id, targetId);
  await ctx.db.patch(targetId, { memberCount: a.length + b.length });
  await ctx.db.patch(sourceId, {
    active: false,
    lookingForMembers: false,
    memberCount: 0,
    mergedInto: targetId,
  });
  await writeAudit(ctx, user._id, "team.merge", eventId, {
    targetTable: "teams",
    targetId,
    data: { sourceId },
  });
  return null;
}
export async function requestMerge(
  ctx: MutationCtx,
  user: Doc<"users">,
  sourceId: Id<"teams">,
  targetId: Id<"teams">,
) {
  const { team } = await member(ctx, user, sourceId);
  leader(team, user);
  await unlocked(ctx, team);
  const target = await ctx.db.get(targetId);
  if (
    !target ||
    target.eventId !== team.eventId ||
    targetId === sourceId ||
    target.active === false
  )
    throw new ConvexError("INVALID_MERGE");
  await unlocked(ctx, target);
  const pending = await ctx.db
    .query("teamMergeRequests")
    .withIndex("by_eventId_and_sourceId_and_status", (q) =>
      q
        .eq("eventId", team.eventId)
        .eq("sourceId", sourceId)
        .eq("status", "pending"),
    )
    .take(1);
  if (pending.length) throw new ConvexError("MERGE_ALREADY_PENDING");
  const id = await requests.create(ctx, team, targetId, user._id);
  await writeAudit(ctx, user._id, "team.merge_request", team.eventId, {
    targetTable: "teams",
    targetId: sourceId,
    data: { targetId },
  });
  return id;
}
export async function resolveMerge(
  ctx: MutationCtx,
  user: Doc<"users">,
  id: Id<"teamMergeRequests">,
  accept: boolean,
) {
  const r = await ctx.db.get(id);
  if (!r || r.status !== "pending") throw new ConvexError("NOT_FOUND");
  const { team } = await member(ctx, user, r.targetId);
  leader(team, user);
  const source = await ctx.db.get(r.sourceId);
  if (accept && source?.leaderId !== r.requestedBy)
    throw new ConvexError("MERGE_LEADER_CHANGED");
  if (accept) await merge(ctx, user, r.sourceId, r.targetId, r.eventId);
  await requests.resolve(ctx, id, accept ? "accepted" : "rejected");
  await writeAudit(ctx, user._id, "team.merge_response", team.eventId, {
    targetTable: "teams",
    targetId: team._id,
    data: { accept, requestId: id },
  });
  return null;
}

export async function cancelMerge(
  ctx: MutationCtx,
  user: Doc<"users">,
  id: Id<"teamMergeRequests">,
) {
  const r = await ctx.db.get(id);
  if (!r || r.status !== "pending") throw new ConvexError("NOT_FOUND");
  const { team } = await member(ctx, user, r.sourceId);
  leader(team, user);
  await requests.resolve(ctx, id, "rejected");
  await writeAudit(ctx, user._id, "team.merge_cancelled", team.eventId, {
    targetTable: "teams",
    targetId: team._id,
  });
  return null;
}
