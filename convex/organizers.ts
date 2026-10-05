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
  superAdminQuery,
  superAdminMutation,
} from "./lib/functions";
import { applicationStatus } from "./lib/manageValidators";
import * as applications from "./model/organizerApplications";
export const mine = authedQuery({
  args: {},
  returns: v.union(doc(schema, "organizerApplications"), v.null()),
  handler: async (ctx) =>
    ctx.db
      .query("organizerApplications")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .first(),
});
export const submit = authedMutation({
  args: { org: v.string(), motivation: v.string(), links: v.array(v.string()) },
  returns: v.id("organizerApplications"),
  handler: async (ctx, args) => applications.submit(ctx, ctx.user, args),
});
const reviewedApplication = v.object({
  application: doc(schema, "organizerApplications"),
  applicant: v.object({
    name: v.string(),
    wallet: v.string(),
    email: v.union(v.string(), v.null()),
  }),
});
export const list = superAdminQuery({
  args: { status: applicationStatus, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(reviewedApplication),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("organizerApplications")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (application) => {
          const user = await ctx.db.get(application.userId);
          return {
            application,
            applicant: {
              name: user?.name ?? "Sin nombre",
              wallet: user?.wallet ?? "",
              email: user?.email ?? null,
            },
          };
        }),
      ),
    };
  },
});
export const review = superAdminMutation({
  args: {
    applicationId: v.id("organizerApplications"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    note: v.string(),
    eventLimit: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => applications.review(ctx, ctx.user, args),
});
