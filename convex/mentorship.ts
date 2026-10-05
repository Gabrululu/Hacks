import { v, ConvexError } from "convex/values";
import { authedQuery, authedMutation, eventQuery, eventMutation } from "./lib/functions";
import { member } from "./lib/projectAccess";

const bookingStatus = v.union(
  v.literal("booked"), v.literal("cancelled"), v.literal("no_show"), v.literal("completed"),
);
const slotView = v.object({
  id: v.id("mentorSlots"), mentorId: v.id("mentors"), mentorName: v.string(),
  expertise: v.array(v.string()), startsAt: v.number(), endsAt: v.number(),
  capacity: v.number(), booked: v.number(), meetingUrl: v.union(v.string(), v.null()),
});

export const teamSchedule = authedQuery({
  args: { teamId: v.id("teams"), from: v.number() },
  returns: v.object({ slots: v.array(slotView), bookings: v.array(v.object({
    id: v.id("mentorBookings"), slotId: v.id("mentorSlots"), mentorName: v.string(),
    startsAt: v.number(), endsAt: v.number(), meetingUrl: v.union(v.string(), v.null()),
    status: bookingStatus, cancellationReason: v.union(v.string(), v.null()),
  })) }),
  handler: async (ctx, args) => {
    const { team, event } = await member(ctx, ctx.user, args.teamId);
    if (!Number.isSafeInteger(args.from)) throw new ConvexError("INVALID_TIME_WINDOW");
    const from = Math.max(event.timeline.startsAt, Math.min(args.from, event.timeline.judgingClosesAt));
    const slots = await ctx.db.query("mentorSlots")
      .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id)
        .gte("startsAt", from).lte("startsAt", Math.min(from + 90 * 86400000, event.timeline.judgingClosesAt)))
      .take(100);
    const visibleSlots = await Promise.all(slots.map(async (slot) => {
      const mentor = await ctx.db.get(slot.mentorId);
      if (!mentor) return null;
      const booked = await ctx.db.query("mentorBookings")
        .withIndex("by_slot_and_status", (q) => q.eq("slotId", slot._id).eq("status", "booked"))
        .take(slot.capacity);
      return { id: slot._id, mentorId: mentor._id, mentorName: mentor.name,
        expertise: mentor.expertise, startsAt: slot.startsAt, endsAt: slot.endsAt,
        capacity: slot.capacity, booked: booked.length, meetingUrl: null };
    }));
    const bookings = await ctx.db.query("mentorBookings")
      .withIndex("by_event_and_team", (q) => q.eq("eventId", event._id).eq("teamId", team._id))
      .order("desc").take(50);
    const bookingRows = await Promise.all(bookings.map(async (booking) => {
      const [slot, mentor] = await Promise.all([ctx.db.get(booking.slotId), ctx.db.get(booking.mentorId)]);
      return slot && mentor ? { id: booking._id, slotId: slot._id, mentorName: mentor.name,
        startsAt: slot.startsAt, endsAt: slot.endsAt, meetingUrl: slot.meetingUrl ?? null,
        status: booking.status, cancellationReason: booking.cancellationReason ?? null } : null;
    }));
    return { slots: visibleSlots.filter((s): s is NonNullable<typeof s> => !!s),
      bookings: bookingRows.filter((b): b is NonNullable<typeof b> => !!b) };
  },
});

export const book = authedMutation({
  args: { teamId: v.id("teams"), slotId: v.id("mentorSlots") },
  returns: v.id("mentorBookings"),
  handler: async (ctx, args) => {
    const { team, event } = await member(ctx, ctx.user, args.teamId);
    const slot = await ctx.db.get(args.slotId);
    if (!slot || slot.eventId !== event._id) throw new ConvexError("SLOT_NOT_FOUND");
    const now = Date.now();
    if (slot.startsAt <= now || slot.startsAt < event.timeline.startsAt || slot.endsAt > event.timeline.judgingClosesAt)
      throw new ConvexError("SLOT_UNAVAILABLE");
    const previousRows = await ctx.db.query("mentorBookings")
      .withIndex("by_slot_and_team", (q) => q.eq("slotId", slot._id).eq("teamId", team._id))
      .order("desc").take(50);
    const activeBooking = previousRows.find((row) => row.status === "booked");
    if (activeBooking) return activeBooking._id;
    const booked = await ctx.db.query("mentorBookings")
      .withIndex("by_slot_and_status", (q) => q.eq("slotId", slot._id).eq("status", "booked"))
      .take(slot.capacity);
    if (booked.length >= slot.capacity) throw new ConvexError("SLOT_FULL");
    const existing = previousRows.find((row) => row.status === "cancelled");
    if (existing) {
      await ctx.db.patch(existing._id, { status: "booked", bookedBy: ctx.user._id, bookedAt: now,
        cancelledAt: undefined, cancelledBy: undefined, cancellationReason: undefined });
      return existing._id;
    }
    return ctx.db.insert("mentorBookings", { eventId: event._id, slotId: slot._id,
      mentorId: slot.mentorId, teamId: team._id, bookedBy: ctx.user._id, status: "booked", bookedAt: now });
  },
});

export const cancel = authedMutation({
  args: { bookingId: v.id("mentorBookings"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.status !== "booked") throw new ConvexError("BOOKING_NOT_ACTIVE");
    const { team } = await member(ctx, ctx.user, booking.teamId);
    if (team.eventId !== booking.eventId) throw new ConvexError("NOT_FOUND");
    const slot = await ctx.db.get(booking.slotId);
    if (!slot || slot.startsAt <= Date.now()) throw new ConvexError("CANCELLATION_CLOSED");
    const reason = args.reason.trim();
    if (reason.length > 300) throw new ConvexError("INVALID_REASON");
    await ctx.db.patch(booking._id, { status: "cancelled", cancelledAt: Date.now(),
      cancelledBy: ctx.user._id, cancellationReason: reason || "Cancelada por el equipo." });
    return null;
  },
});

export const cancelByOrganizer = eventMutation("mentors.manage", "mentorship.cancel")({
  args: { bookingId: v.id("mentorBookings"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.eventId !== args.eventId || booking.status !== "booked")
      throw new ConvexError("BOOKING_NOT_ACTIVE");
    const slot = await ctx.db.get(booking.slotId);
    if (!slot || slot.startsAt <= Date.now()) throw new ConvexError("CANCELLATION_CLOSED");
    const reason = args.reason.trim();
    if (reason.length < 3 || reason.length > 300) throw new ConvexError("INVALID_REASON");
    await ctx.db.patch(booking._id, { status: "cancelled", cancelledAt: Date.now(),
      cancelledBy: ctx.user._id, cancellationReason: reason });
    return null;
  },
});

export const createSlot = eventMutation("mentors.manage", "mentorship.slot.create")({
  args: { mentorId: v.id("mentors"), startsAt: v.number(), endsAt: v.number(), capacity: v.number(), meetingUrl: v.optional(v.string()) },
  returns: v.id("mentorSlots"),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId), mentor = await ctx.db.get(args.mentorId);
    if (!event || !mentor || mentor.eventId !== event._id) throw new ConvexError("MENTOR_NOT_FOUND");
    if (event.status === "archived" || event.status === "suspended") throw new ConvexError("EVENT_CLOSED");
    if (!Number.isSafeInteger(args.startsAt) || !Number.isSafeInteger(args.endsAt) || args.startsAt <= Date.now() ||
      args.endsAt <= args.startsAt || args.endsAt - args.startsAt < 15 * 60000 || args.endsAt - args.startsAt > 180 * 60000 ||
      args.startsAt < event.timeline.startsAt || args.endsAt > event.timeline.judgingClosesAt ||
      !Number.isInteger(args.capacity) || args.capacity < 1 || args.capacity > 50)
      throw new ConvexError("INVALID_SLOT");
    const meetingUrl = args.meetingUrl?.trim();
    if (meetingUrl) {
      try { const url = new URL(meetingUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); }
      catch { throw new ConvexError("INVALID_MEETING_URL"); }
    }
    const nearby = await ctx.db.query("mentorSlots")
      .withIndex("by_mentor_and_startsAt", (q) => q.eq("mentorId", mentor._id).gte("startsAt", args.startsAt - 180 * 60000).lte("startsAt", args.endsAt))
      .take(100);
    if (nearby.some((slot) => args.startsAt < slot.endsAt && args.endsAt > slot.startsAt))
      throw new ConvexError("MENTOR_SLOT_OVERLAP");
    return ctx.db.insert("mentorSlots", { eventId: event._id, mentorId: mentor._id,
      startsAt: args.startsAt, endsAt: args.endsAt, capacity: args.capacity,
      meetingUrl: meetingUrl || undefined, createdBy: ctx.user._id });
  },
});

export const eventSchedule = eventQuery("mentors.manage")({
  args: {},
  returns: v.array(v.object({
    id: v.id("mentorBookings"), teamName: v.string(), mentorName: v.string(),
    startsAt: v.number(), endsAt: v.number(), meetingUrl: v.union(v.string(), v.null()),
    status: bookingStatus, cancellationReason: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("mentorBookings")
      .withIndex("by_event_and_team", (q) => q.eq("eventId", args.eventId))
      .order("desc").take(250);
    const result = await Promise.all(rows.map(async (row) => {
      const [team, slot, mentor] = await Promise.all([ctx.db.get(row.teamId), ctx.db.get(row.slotId), ctx.db.get(row.mentorId)]);
      return team && slot && mentor ? { id: row._id, teamName: team.name, mentorName: mentor.name,
        startsAt: slot.startsAt, endsAt: slot.endsAt, meetingUrl: slot.meetingUrl ?? null,
        status: row.status, cancellationReason: row.cancellationReason ?? null } : null;
    }));
    return result.filter((row): row is NonNullable<typeof row> => !!row);
  },
});

export const eventSlots = eventQuery("mentors.manage")({
  args: {},
  returns: v.array(slotView),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("mentorSlots")
      .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .order("desc").take(150);
    const result = await Promise.all(rows.map(async (slot) => {
      const mentor = await ctx.db.get(slot.mentorId);
      if (!mentor) return null;
      const bookings = await ctx.db.query("mentorBookings")
        .withIndex("by_slot_and_status", (q) => q.eq("slotId", slot._id).eq("status", "booked"))
        .take(slot.capacity);
      return { id: slot._id, mentorId: mentor._id, mentorName: mentor.name, expertise: mentor.expertise,
        startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: slot.capacity,
        booked: bookings.length, meetingUrl: slot.meetingUrl ?? null };
    }));
    return result.filter((row): row is NonNullable<typeof row> => !!row);
  },
});

export const setAttendance = eventMutation("mentors.manage", "mentorship.attendance")({
  args: { bookingId: v.id("mentorBookings"), status: v.union(v.literal("no_show"), v.literal("completed")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId), slot = booking ? await ctx.db.get(booking.slotId) : null;
    if (!booking || booking.eventId !== args.eventId || booking.status !== "booked" || !slot)
      throw new ConvexError("BOOKING_NOT_ACTIVE");
    if (slot.endsAt > Date.now()) throw new ConvexError("SESSION_NOT_FINISHED");
    await ctx.db.patch(booking._id, { status: args.status, attendanceMarkedAt: Date.now(), attendanceMarkedBy: ctx.user._id });
    return null;
  },
});
