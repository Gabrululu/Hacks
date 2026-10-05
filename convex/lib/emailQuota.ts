import { RateLimiter, type RateLimitConfig } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
export const emailLimiter = new RateLimiter(components.rateLimiter);
export function monthQuota(event: Doc<"events">, now: number) {
  const date = new Date(now);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  const config: RateLimitConfig = {
    kind: "fixed window",
    rate: event.emailMonthlyLimit ?? 1000,
    period: end - start,
    start,
  };
  return { key: `${event._id}:${start}`, config, start, end };
}
