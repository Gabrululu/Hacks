import { emailLimiter, monthQuota } from "../lib/emailQuota";
import { workflow } from "../communicationWorkflow";
import type { WorkflowId } from "@convex-dev/workflow";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id, TableNames } from "../_generated/dataModel";
export function localOnly() {
  const site = process.env.CONVEX_SITE_URL,
    issuer = process.env.AUTH_ISSUER;
  if (
    !site ||
    !issuer ||
    !["127.0.0.1", "localhost"].includes(new URL(site).hostname) ||
    !["127.0.0.1", "localhost"].includes(new URL(issuer).hostname)
  )
    throw new ConvexError("LOCAL_TEST_CLEANUP_ONLY");
}
export async function fixtureEvent(ctx: QueryCtx, eventId: Id<"events">) {
  localOnly();
  const e = await ctx.db.get(eventId);
  if (!e) return null;
  const owner = await ctx.db.get(e.ownerId);
  if (
    !/^build-browser-\d{13}$/.test(e.slug) ||
    e.name !== "Prueba Buildathon Stellar" ||
    owner?.name !== "Comunidad de builders" ||
    owner.email !== "comunidad@example.com" ||
    owner.platformRole === "superadmin"
  )
    throw new ConvexError("NOT_A_TEST_FIXTURE");
  return e;
}
type Row = { _id: Id<TableNames>; fileId?: Id<"_storage"> };
const readers: Record<
  string,
  (ctx: MutationCtx, eventId: Id<"events">) => Promise<Row[]>
> = {
  eventMail: (ctx, eventId) =>
    ctx.db
      .query("eventMail")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(10),
  eventEmailPreferences: (ctx, eventId) =>
    ctx.db
      .query("eventEmailPreferences")
      .withIndex("by_eventId_and_userId", (q) => q.eq("eventId", eventId))
      .take(10),
  emailDeliveries: (ctx, eventId) =>
    ctx.db
      .query("emailDeliveries")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(10),
  roundProjects: (ctx, eventId) =>
    ctx.db
      .query("roundProjects")
      .withIndex("by_eventId_and_roundId_and_submissionId", (q) =>
        q.eq("eventId", eventId),
      )
      .take(10),
  judgingResults: (ctx, eventId) =>
    ctx.db
      .query("judgingResults")
      .withIndex("by_eventId_and_roundId_and_submissionId", (q) =>
        q.eq("eventId", eventId),
      )
      .take(10),
  teamMergeRequests: (ctx, eventId) =>
    ctx.db
      .query("teamMergeRequests")
      .withIndex("by_eventId_and_targetId_and_status", (q) =>
        q.eq("eventId", eventId),
      )
      .take(10),
  projectUploads: (ctx, eventId) =>
    ctx.db
      .query("projectUploads")
      .withIndex("by_eventId_and_teamId", (q) => q.eq("eventId", eventId))
      .take(10),
  submissionVersions: (ctx, eventId) =>
    ctx.db
      .query("submissionVersions")
      .withIndex("by_eventId_and_teamId", (q) => q.eq("eventId", eventId))
      .take(10),
  eventStaff: (ctx, eventId) =>
    ctx.db
      .query("eventStaff")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
      .take(10),
  staffInvites: (ctx, eventId) =>
    ctx.db
      .query("staffInvites")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  tracks: (ctx, eventId) =>
    ctx.db
      .query("tracks")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  eventAssets: (ctx, eventId) =>
    ctx.db
      .query("eventAssets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  forms: (ctx, eventId) =>
    ctx.db
      .query("forms")
      .withIndex("by_event_kind", (q) => q.eq("eventId", eventId))
      .take(10),
  registrations: (ctx, eventId) =>
    ctx.db
      .query("registrations")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
      .take(10),
  registrationTotals: (ctx, eventId) =>
    ctx.db
      .query("registrationTotals")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(10),
  registrationUploads: (ctx, eventId) =>
    ctx.db
      .query("registrationUploads")
      .withIndex("by_eventId_and_userId", (q) => q.eq("eventId", eventId))
      .take(10),
  registrationNotifications: (ctx, eventId) =>
    ctx.db
      .query("registrationNotifications")
      .withIndex("by_eventId_and_userId", (q) => q.eq("eventId", eventId))
      .take(10),
  teams: (ctx, eventId) =>
    ctx.db
      .query("teams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  teamMembers: (ctx, eventId) =>
    ctx.db
      .query("teamMembers")
      .withIndex("by_event_team", (q) => q.eq("eventId", eventId))
      .take(10),
  checkpoints: (ctx, eventId) =>
    ctx.db
      .query("checkpoints")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  checkpointSubmissions: (ctx, eventId) =>
    ctx.db
      .query("checkpointSubmissions")
      .withIndex("by_event_team", (q) => q.eq("eventId", eventId))
      .take(10),
  submissions: (ctx, eventId) =>
    ctx.db
      .query("submissions")
      .withIndex("by_event_status", (q) => q.eq("eventId", eventId))
      .take(10),
  rubrics: (ctx, eventId) =>
    ctx.db
      .query("rubrics")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  judgingRounds: (ctx, eventId) =>
    ctx.db
      .query("judgingRounds")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  judgeAssignments: (ctx, eventId) =>
    ctx.db
      .query("judgeAssignments")
      .withIndex("by_event_judge_round", (q) => q.eq("eventId", eventId))
      .take(10),
  auditLog: (ctx, eventId) =>
    ctx.db
      .query("auditLog")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  scores: (ctx, eventId) =>
    ctx.db
      .query("scores")
      .withIndex("by_event_assignment", (q) => q.eq("eventId", eventId))
      .take(10),
  resources: (ctx, eventId) =>
    ctx.db
      .query("resources")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  mentors: (ctx, eventId) =>
    ctx.db
      .query("mentors")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  mentorBookings: (ctx, eventId) =>
    ctx.db.query("mentorBookings")
      .withIndex("by_event_and_team", (q) => q.eq("eventId", eventId))
      .take(10),
  mentorSlots: (ctx, eventId) =>
    ctx.db.query("mentorSlots")
      .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", eventId))
      .take(10),
  announcements: (ctx, eventId) =>
    ctx.db
      .query("announcements")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  emailCampaigns: (ctx, eventId) =>
    ctx.db
      .query("emailCampaigns")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(10),
  emailRecipients: (ctx, eventId) =>
    ctx.db
      .query("emailRecipients")
      .withIndex("by_event_campaign", (q) => q.eq("eventId", eventId))
      .take(10),
};
export const TABLES = Object.keys(readers);
export async function purge(
  ctx: MutationCtx,
  eventId: Id<"events">,
  table: string,
) {
  const event = await fixtureEvent(ctx, eventId);
  if (!event) return { removed: 0, more: false };
  if (table === "events") {
    for (const read of Object.values(readers))
      if ((await read(ctx, eventId)).length)
        throw new ConvexError("CLEAN_CHILDREN_FIRST");
    const quota = monthQuota(event, Date.now());
    await emailLimiter.reset(ctx, "eventEmail", { key: quota.key });
    await emailLimiter.reset(ctx, "announcementPost", { key: eventId });
    await ctx.db.delete(eventId);
    return { removed: 1, more: false };
  }
  const read = readers[table];
  if (!read) throw new ConvexError("INVALID_TABLE");
  const rows = await read(ctx, eventId);
  for (const row of rows) {
    if (
      row.fileId &&
      ["eventAssets", "registrationUploads", "projectUploads"].includes(table)
    )
      await ctx.storage.delete(row.fileId);
    if (table === "emailCampaigns") {
      const campaign = await ctx.db.get(row._id as Id<"emailCampaigns">);
      if (campaign?.workflowId) {
        const status = await workflow.status(
          ctx,
          campaign.workflowId as WorkflowId,
        );
        if (status.type === "inProgress")
          await workflow.cancel(ctx, campaign.workflowId as WorkflowId);
        await workflow.cleanup(ctx, campaign.workflowId as WorkflowId);
      }
    }
    await ctx.db.delete(row._id);
  }
  return { removed: rows.length, more: rows.length === 10 };
}

export async function registerWallet(
  ctx: MutationCtx,
  wallet: string,
  runId: string,
) {
  localOnly();
  if (!/^G[A-Z2-7]{55}$/.test(wallet) || runId.length > 80)
    throw new ConvexError("INVALID_FIXTURE");
  const marker = await ctx.db
    .query("testFixtures")
    .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
    .unique();
  if (marker) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
    .unique();
  if (user) throw new ConvexError("NOT_A_NEW_TEST_WALLET");
  await ctx.db.insert("testFixtures", { wallet, runId });
  return null;
}
export async function markLegacy(ctx: MutationCtx, eventId: Id<"events">) {
  const event = await fixtureEvent(ctx, eventId);
  if (!event) return null;
  const staff = await ctx.db
      .query("eventStaff")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
      .take(25),
    registrations = await ctx.db
      .query("registrations")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId))
      .take(25),
    ids = new Set([
      event.ownerId,
      ...staff.map((s) => s.userId),
      ...registrations.map((r) => r.userId),
    ]);
  for (const id of ids) {
    const user = await ctx.db.get(id);
    if (!user || user.platformRole === "superadmin") continue;
    // Preserve unknown people, even when they participated in a disposable event.
    if (
      id !== event.ownerId &&
      !(
        user.name === "Builder de fase cuatro" &&
        user.email === "fase-cuatro@example.com"
      )
    )
      continue;
    if (
      !(await ctx.db
        .query("testFixtures")
        .withIndex("by_wallet", (q) => q.eq("wallet", user.wallet))
        .unique())
    )
      await ctx.db.insert("testFixtures", {
        wallet: user.wallet,
        runId: "legacy",
      });
  }
  return null;
}
export async function removeWalletBatch(ctx: MutationCtx, runId: string) {
  localOnly();
  const markers = await ctx.db
    .query("testFixtures")
    .withIndex("by_runId", (q) => q.eq("runId", runId))
    .take(1);
  if (!markers.length) return { removed: 0, more: false };
  const marker = markers[0],
    user = await ctx.db
      .query("users")
      .withIndex("by_wallet", (q) => q.eq("wallet", marker.wallet))
      .unique();
  if (user) {
    if (user.platformRole === "superadmin")
      throw new ConvexError("PRESERVE_SUPERADMIN");
    if (
      (
        await ctx.db
          .query("events")
          .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
          .take(1)
      ).length ||
      (
        await ctx.db
          .query("registrations")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .take(1)
      ).length ||
      (
        await ctx.db
          .query("teamMembers")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .take(1)
      ).length
    )
      throw new ConvexError("CLEAN_TEST_EVENTS_FIRST");
    const staffRows = await ctx.db
      .query("eventStaff")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10);
    for (const row of staffRows) {
      const event = await ctx.db.get(row.eventId);
      if (event) throw new ConvexError("CLEAN_TEST_EVENTS_FIRST");
    }
    const groups = [
      await ctx.db
        .query("eventMail")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(10),
      await ctx.db
        .query("eventEmailPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(10),
      await ctx.db
        .query("emailDeliveries")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(10),
      await ctx.db
        .query("authSessions")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(10),
      await ctx.db
        .query("emailVerifications")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10),
      await ctx.db
        .query("eventStaff")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10),
      await ctx.db
        .query("organizerApplications")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(10),
      await ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => q.eq("actorId", user._id))
        .take(10),
    ];
    let removed = 0;
    for (const rows of groups)
      for (const row of rows) {
        await ctx.db.delete(row._id);
        removed++;
      }
    if (removed) return { removed, more: true };
    await ctx.db.delete(user._id);
  }
  const challenges = await ctx.db
    .query("authChallenges")
    .withIndex("by_wallet", (q) => q.eq("wallet", marker.wallet))
    .take(10);
  for (const c of challenges) await ctx.db.delete(c._id);
  if (challenges.length === 10)
    return { removed: challenges.length, more: true };
  await ctx.db.delete(marker._id);
  return { removed: 1, more: true };
}
