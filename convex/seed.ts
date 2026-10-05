import { v } from "convex/values";
import { internalMutation } from "./lib/functions";
import { seedSuperadmins } from "./model/users";
export const superadmin = internalMutation({
  args: {},
  returns: v.number(),
  handler: seedSuperadmins,
});
