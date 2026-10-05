import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 1000, base: 2 },
    retryActionsByDefault: true,
  },
});
export const dispatch = workflow.define({
  args: {
    campaignId: v.id("emailCampaigns"),
    at: v.number(),
    retry: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (step, { campaignId, at, retry }): Promise<null> => {
    try {
      let cursor: string | null = null;
      for (; !retry;) {
        const page: { cursor: string | null; done: boolean } =
          await step.runMutation(internal.communicationJobs.snapshot, {
            campaignId,
            cursor,
          });
        if (page.done) break;
        cursor = page.cursor;
      }
      await step.runMutation(
        internal.communicationJobs.begin,
        { campaignId },
        { runAt: at },
      );
      cursor = null;
      for (;;) {
        const page: {
          ids: import("./_generated/dataModel").Id<"emailRecipients">[];
          cursor: string | null;
          done: boolean;
        } = await step.runQuery(internal.communicationJobs.batch, {
          campaignId,
          cursor,
          retry,
        });
        await step.runAction(internal.communicationEmails.deliverBatch, {
          ids: page.ids,
          retry: retry ?? false,
        });
        if (page.done) break;
        cursor = page.cursor;
      }
      await step.runMutation(internal.communicationJobs.finish, {
        campaignId,
        failed: false,
      });
    } catch {
      await step.runMutation(internal.communicationJobs.finish, {
        campaignId,
        failed: true,
      });
    }
    return null;
  },
});
