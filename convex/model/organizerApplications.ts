import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { approveOrganizer } from "./users";
import { writeAudit } from "./auditLog";
export async function submit(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: { org: string; motivation: string; links: string[] },
) {
  if (!user.name || !user.emailVerifiedAt)
    throw new ConvexError("PROFILE_INCOMPLETE");
  if (user.platformRole !== "user") throw new ConvexError("ALREADY_ORGANIZER");
  const latest = await ctx.db
    .query("organizerApplications")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .order("desc")
    .first();
  if (latest?.status === "pending")
    throw new ConvexError("APPLICATION_PENDING");
  const org = args.org.trim(),
    motivation = args.motivation.trim();
  if (
    org.length < 2 ||
    org.length > 100 ||
    motivation.length < 30 ||
    motivation.length > 2000 ||
    args.links.length > 5
  )
    throw new ConvexError("INVALID_APPLICATION");
  const links = args.links.map((link) => {
    try {
      const url = new URL(link.trim());
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        link.length > 300
      )
        throw new Error();
      return url.href;
    } catch {
      throw new ConvexError("INVALID_LINK");
    }
  });
  const id = await ctx.db.insert("organizerApplications", {
    userId: user._id,
    org,
    motivation,
    links,
    status: "pending",
  });
  await writeAudit(ctx, user._id, "organizer.apply");
  return id;
}
export async function review(
  ctx: MutationCtx,
  actor: Doc<"users">,
  args: {
    applicationId: Id<"organizerApplications">;
    decision: "approved" | "rejected";
    note: string;
    eventLimit: number;
  },
) {
  const application = await ctx.db.get(args.applicationId);
  if (!application || application.status !== "pending")
    throw new ConvexError("APPLICATION_NOT_PENDING");
  if (
    !Number.isInteger(args.eventLimit) ||
    args.eventLimit < 1 ||
    args.eventLimit > 100 ||
    args.note.length > 1000
  )
    throw new ConvexError("INVALID_REVIEW");
  if (args.decision === "approved")
    await approveOrganizer(ctx, application.userId, args.eventLimit);
  await ctx.db.patch(application._id, {
    status: args.decision,
    reviewedBy: actor._id,
    reviewedAt: Date.now(),
    reviewNote: args.note.trim(),
  });
  return null;
}
