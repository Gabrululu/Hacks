import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
export type Criterion = Doc<"rubrics">["criteria"][number];
export function validateCriteria(criteria: Criterion[]) {
  if (
    !criteria.length ||
    criteria.length > 20 ||
    new Set(criteria.map((c) => c.id)).size !== criteria.length
  )
    throw new ConvexError("INVALID_RUBRIC");
  for (const c of criteria)
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(c.id) ||
      !c.name.trim() ||
      c.name.length > 120 ||
      (c.description?.length ?? 0) > 2000 ||
      ![c.weight, c.min, c.max].every(Number.isFinite) ||
      c.weight <= 0 ||
      c.weight > 1000 ||
      c.min >= c.max ||
      Math.abs(c.min) > 1000000 ||
      Math.abs(c.max) > 1000000
    )
      throw new ConvexError("INVALID_RUBRIC");
}
export function normalizedScores(
  criteria: Criterion[],
  values: Record<string, number>,
) {
  if (
    Object.keys(values).length !== criteria.length ||
    Object.keys(values).some((id) => !criteria.some((c) => c.id === id))
  )
    throw new ConvexError("INVALID_SCORE");
  let sum = 0,
    weights = 0;
  const normalized: Record<string, number> = {};
  for (const c of criteria) {
    const value = values[c.id];
    if (!Number.isFinite(value) || value < c.min || value > c.max)
      throw new ConvexError("INVALID_SCORE");
    normalized[c.id] = (100 * (value - c.min)) / (c.max - c.min);
    sum += normalized[c.id] * c.weight;
    weights += c.weight;
  }
  return { total: Math.round((sum / weights) * 1000000) / 1000000, normalized };
}
