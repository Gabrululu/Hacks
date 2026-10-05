import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "remove expired auth records",
  { minutes: 5 },
  internal.authData.cleanup,
  {},
);
crons.interval(
  "remove old email verifications",
  { hours: 1 },
  internal.emailData.cleanup,
  {},
);
export default crons;
