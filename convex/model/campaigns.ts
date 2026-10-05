import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { workflow } from "../communicationWorkflow";
import { internal } from "../_generated/api";
import { validateAudience } from "./emailAudience";
import { can } from "../lib/permissions";
export async function campaignFor(
  ctx: QueryCtx,
  eventId: Id<"events">,
  id: Id<"emailCampaigns">,
) {
  const campaign = await ctx.db.get(id);
  if (!campaign || campaign.eventId !== eventId)
    throw new ConvexError("CAMPAIGN_UNAVAILABLE");
  return campaign;
}
export async function allowed(ctx: QueryCtx, campaign: Doc<"emailCampaigns">) {
  const event = await ctx.db.get(campaign.eventId);
  if (!event || event.status !== "published") return false;
  if (campaign.category === "transactional") return event.resultsPublished;
  const author = await ctx.db.get(campaign.authorId);
  if (
    !author ||
    author.suspendedAt !== undefined ||
    !(await can(ctx, author, event._id, "email.send"))
  )
    return false;
  try {
    await validateAudience(ctx, event._id, author, campaign.audience);
    return true;
  } catch {
    return false;
  }
}
export async function start(
  ctx: MutationCtx,
  campaign: Doc<"emailCampaigns">,
  at: number,
) {
  await ctx.db.patch(campaign._id, {
    status: "preparing",
    frozenAt: Date.now(),
    audienceFrozen: false,
    scheduledAt: at,
    recipientCount: 0,
    error: undefined,
  });
  const workflowId = await workflow.start(
    ctx,
    internal.communicationWorkflow.dispatch,
    { campaignId: campaign._id, at },
  );
  await ctx.db.patch(campaign._id, { workflowId });
}
export async function results(ctx: MutationCtx, event: Doc<"events">) {
  const eventUrl = event.domainSlug
    ? `https://${event.domainSlug}.hacks.mintedinpe.com`
    : `${(process.env.APP_URL ?? "https://hacks.mintedinpe.com").replace(/\/$/, "")}/e/${event.slug}`;
  const id = await ctx.db.insert("emailCampaigns", {
    eventId: event._id,
    authorId: event.ownerId,
    subject: "Resultados publicados: {{eventName}}",
    bodyMarkdown: `Hola {{name}}. Los resultados de {{eventName}} ya están disponibles.\n\n[Consultar resultados](${eventUrl})`,
    audience: { kind: "approved" },
    category: "transactional",
    status: "draft",
  });
  await start(ctx, (await ctx.db.get(id))!, Date.now());
}
