import {
  query,
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
  action,
} from "../_generated/server";
import {
  customQuery,
  customAction,
  customMutation,
  customCtx,
} from "convex-helpers/server/customFunctions";
import { v, ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { User } from "./types";
import { requireUser, can, type Permission } from "./permissions";
import { logAction } from "./audit";
import { metricTriggers } from "./metrics";
const mutation = customMutation(rawMutation, customCtx(metricTriggers.wrapDB));
export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(metricTriggers.wrapDB),
);
export const publicQuery = customQuery(
  query,
  customCtx(() => ({})),
);
export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) })),
);
export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) })),
);
export const eventQuery = (permission: Permission | readonly Permission[]) =>
  customQuery(query, {
    args: { eventId: v.id("events") },
    input: async (ctx, { eventId }) => {
      const user = await requireUser(ctx);
      const requested =
        typeof permission === "string" ? [permission] : permission;
      if (
        !(
          await Promise.all(requested.map((p) => can(ctx, user, eventId, p)))
        ).some(Boolean)
      )
        throw new ConvexError("FORBIDDEN");
      return { ctx: { user, eventId }, args: { eventId } };
    },
  });
export const eventMutation = (
  permission: Permission,
  auditAction: string = permission,
) =>
  customMutation(mutation, {
    args: { eventId: v.id("events") },
    input: async (ctx, { eventId }) => {
      const user = await requireUser(ctx);
      if (!(await can(ctx, user, eventId, permission)))
        throw new ConvexError("FORBIDDEN");
      return {
        ctx: { user, eventId },
        args: { eventId },
        onSuccess: async ({ args }) => {
          const target =
            typeof args.memberId === "string"
              ? { targetTable: "eventStaff", targetId: args.memberId }
              : typeof args.inviteId === "string"
                ? { targetTable: "staffInvites", targetId: args.inviteId }
                : typeof args.id === "string" &&
                    [
                      "project.review",
                      "checkpoint.review",
                      "checkpoint.save",
                      "checkpoint.remove",
                    ].includes(auditAction)
                  ? {
                      targetTable:
                        auditAction === "project.review"
                          ? "submissions"
                          : auditAction === "checkpoint.review"
                            ? "checkpointSubmissions"
                            : "checkpoints",
                      targetId: args.id,
                    }
                  : typeof args.id === "string" &&
                      ["track", "resource", "mentor"].includes(
                        auditAction.split(".")[0],
                      )
                    ? {
                        targetTable: (
                          {
                            track: "tracks",
                            resource: "resources",
                            mentor: "mentors",
                          } as Record<string, string>
                        )[auditAction.split(".")[0]],
                        targetId: args.id,
                      }
                    : { targetTable: "events", targetId: eventId };
          await logAction(ctx, user._id, auditAction, eventId, {
            ...target,
            ...(typeof args.status === "string"
              ? { data: { status: args.status } }
              : {}),
          });
        },
      };
    },
  });
export const superAdminMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.platformRole !== "superadmin") throw new ConvexError("FORBIDDEN");
    return {
      ctx: { user },
      args: {},
      onSuccess: async ({ args }) => {
        // These endpoints record their own targeted audit entries. Backfill is
        // operational bookkeeping, not an administrative decision.
        if (typeof args.table === "string" || typeof args.userId === "string")
          return;
        if (typeof args.eventId === "string") {
          if (typeof args.limit === "number") {
            const eventId = ctx.db.normalizeId("events", args.eventId);
            if (eventId)
              await logAction(
                ctx,
                user._id,
                "admin.event.emailQuota",
                eventId,
                {
                  targetTable: "events",
                  targetId: eventId,
                  data: { limit: args.limit },
                },
              );
          }
          return;
        }
        const reviewed = typeof args.applicationId === "string";
        await logAction(
          ctx,
          user._id,
          reviewed ? `organizer.${args.decision}` : "superadmin.mutation",
          undefined,
          reviewed
            ? {
                targetTable: "organizerApplications",
                targetId: String(args.applicationId),
                data: { eventLimit: Number(args.eventLimit) },
              }
            : undefined,
        );
      },
    };
  },
});

// Authentication bootstraps identity through proof of wallet ownership.
export const publicAuthAction = customAction(
  action,
  customCtx(() => ({})),
);

export const authedAction = customAction(
  action,
  customCtx(async (ctx) => {
    const user: User = await ctx.runQuery(internal.users.current, {});
    return { user };
  }),
);

export const superAdminQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    if (user.platformRole !== "superadmin") throw new ConvexError("FORBIDDEN");
    return { user };
  }),
);
