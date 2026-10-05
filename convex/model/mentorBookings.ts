import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function moveForTeamMerge(
  ctx: MutationCtx,
  eventId: Id<"events">,
  sourceTeamId: Id<"teams">,
  targetTeamId: Id<"teams">,
  actorId: Id<"users">,
) {
  const sourceBookings = await ctx.db.query("mentorBookings")
    .withIndex("by_event_and_team", (q) => q.eq("eventId", eventId).eq("teamId", sourceTeamId))
    .take(100);
  for (const booking of sourceBookings) {
    if (booking.status === "booked") {
      const targetBookings = await ctx.db.query("mentorBookings")
        .withIndex("by_slot_and_team", (q) => q.eq("slotId", booking.slotId).eq("teamId", targetTeamId))
        .take(50);
      if (targetBookings.some((row) => row.status === "booked")) {
        await ctx.db.patch(booking._id, {
          status: "cancelled",
          cancelledAt: Date.now(),
          cancelledBy: actorId,
          cancellationReason: "Cancelada por la fusión; se conserva la reserva del equipo unido.",
        });
        continue;
      }
    }
    await ctx.db.patch(booking._id, { teamId: targetTeamId });
  }
}
