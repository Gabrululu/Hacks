import { v, ConvexError } from "convex/values";
import { authedQuery, authedMutation } from "./lib/functions";
import { internalQuery } from "./_generated/server";
import { requireUser } from "./lib/permissions";
import { updateProfile as saveProfile } from "./model/users";
import { doc } from "convex-helpers/validators";
import schema from "./schema";
const links = v.object({
  github: v.optional(v.string()),
  x: v.optional(v.string()),
  linkedin: v.optional(v.string()),
});
export const current = internalQuery({
  args: {},
  returns: doc(schema, "users"),
  handler: requireUser,
});
export const me = authedQuery({
  args: {},
  returns: v.object({
    id: v.id("users"),
    wallet: v.string(),
    name: v.union(v.string(), v.null()),
    email: v.union(v.string(), v.null()),
    emailVerifiedAt: v.union(v.number(), v.null()),
    bio: v.string(),
    eventLimit: v.number(),
    links,
    platformRole: v.union(
      v.literal("user"),
      v.literal("organizer"),
      v.literal("superadmin"),
    ),
  }),
  handler: async (ctx) => ({
    id: ctx.user._id,
    wallet: ctx.user.wallet,
    name: ctx.user.name ?? null,
    email: ctx.user.email ?? null,
    emailVerifiedAt: ctx.user.emailVerifiedAt ?? null,
    bio: ctx.user.bio ?? "",
    eventLimit: ctx.user.eventLimit ?? 3,
    links: ctx.user.links ?? {},
    platformRole: ctx.user.platformRole,
  }),
});
export const updateProfile = authedMutation({
  args: { name: v.string(), bio: v.string(), links },
  returns: v.null(),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (
      name.length < 2 ||
      name.length > 80 ||
      /[\x00-\x1f]/.test(name) ||
      args.bio.length > 500
    )
      throw new ConvexError("INVALID_PROFILE");
    const cleaned: typeof args.links = {};
    for (const key of ["github", "x", "linkedin"] as const) {
      const value = args.links[key]?.trim();
      if (!value) continue;
      const hosts = {
        github: ["github.com", "www.github.com"],
        x: ["x.com", "twitter.com", "www.x.com", "www.twitter.com"],
        linkedin: ["linkedin.com", "www.linkedin.com"],
      };
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new ConvexError("INVALID_LINK");
      }
      if (
        url.protocol !== "https:" ||
        !hosts[key].includes(url.hostname) ||
        url.username ||
        url.password ||
        value.length > 300
      )
        throw new ConvexError("INVALID_LINK");
      cleaned[key] = url.href;
    }
    await saveProfile(ctx, ctx.user._id, {
      name,
      bio: args.bio.trim(),
      links: cleaned,
    });
    return null;
  },
});
