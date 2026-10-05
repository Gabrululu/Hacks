/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workflowTest from "@convex-dev/workflow/test";
import { expect, test } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"])
    aggregateTest.register(t, `${name}Metrics`);
  async function person(name: string, platformRole: "user" | "organizer") {
    const wallet = Keypair.random().publicKey();
    const { id, sessionId } = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        wallet, name, email: `${name}@example.test`, emailVerifiedAt: Date.now(),
        tokenIdentifier: `test|${name}`, platformRole,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: id, tokenHash: name, network: "testnet", expiresAt: Date.now() + 86400000,
      });
      return { id, sessionId };
    });
    return { id, wallet, client: t.withIdentity({ tokenIdentifier: `test|${name}`, issuer: "test", subject: name, sessionId }) };
  }
  const owner = await person("mentor-organizer", "organizer");
  const alice = await person("alice", "user");
  const bob = await person("bob", "user");
  const carol = await person("carol", "user");
  const dave = await person("dave", "user");
  const eventId = await owner.client.mutation(api.manage.create, {
    name: "Mentorías Hack", slug: "mentorias-hack", type: "hackathon", timezone: "America/Lima",
  });
  const now = Date.now();
  const seeded = await t.run(async (ctx) => {
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("event missing");
    await ctx.db.patch(eventId, { status: "published", timeline: { ...event.timeline, startsAt: now - 3600000, judgingClosesAt: now + 86400000 } });
    const mentorId = await ctx.db.insert("mentors", { eventId, name: "Mentor Uno", expertise: ["Stellar"] });
    const teamId = await ctx.db.insert("teams", { eventId, name: "Equipo A", joinCode: "TEAM123456", leaderId: alice.id, lookingForMembers: false, active: true, memberCount: 2 });
    for (const user of [alice, bob, carol, dave]) {
      await ctx.db.insert("registrations", { eventId, userId: user.id, status: "approved", formVersion: 1, answers: {}, consentAt: now, emailOptOut: false });
    }
    for (const user of [alice, bob])
      await ctx.db.insert("teamMembers", { eventId, teamId, userId: user.id, joinedAt: now });
    const slotId = await ctx.db.insert("mentorSlots", { eventId, mentorId, startsAt: now + 1800000, endsAt: now + 3600000, capacity: 1, createdBy: owner.id });
    const pastSlotId = await ctx.db.insert("mentorSlots", { eventId, mentorId, startsAt: now - 3600000, endsAt: now - 1800000, capacity: 1, createdBy: owner.id });
    const pastBookingId = await ctx.db.insert("mentorBookings", { eventId, slotId: pastSlotId, mentorId, teamId, bookedBy: alice.id, status: "booked", bookedAt: now - 7200000 });
    return { teamId, slotId, pastBookingId };
  });
  return { t, owner, alice, bob, carol, dave, eventId, ...seeded };
}

test("bookings belong to a team, use a shared capacity, and cancellation frees the spot", async () => {
  const s = await setup();
  const bookingId = await s.alice.client.mutation(api.mentorship.book, { teamId: s.teamId, slotId: s.slotId });
  expect(await s.bob.client.mutation(api.mentorship.book, { teamId: s.teamId, slotId: s.slotId })).toBe(bookingId);
  const anotherTeam = await s.t.run(async (ctx) => {
    const id = await ctx.db.insert("teams", { eventId: s.eventId, name: "Equipo B", joinCode: "TEAM765432", leaderId: s.dave.id, lookingForMembers: false, active: true, memberCount: 1 });
    await ctx.db.insert("teamMembers", { eventId: s.eventId, teamId: id, userId: s.dave.id, joinedAt: Date.now() });
    return id;
  });
  await expect(s.dave.client.mutation(api.mentorship.book, { teamId: anotherTeam, slotId: s.slotId })).rejects.toThrow("SLOT_FULL");
  await s.bob.client.mutation(api.mentorship.cancel, { bookingId, reason: "El equipo no puede asistir" });
  expect(await s.t.run(async (ctx) => (await ctx.db.get(bookingId))?.status)).toBe("cancelled");
  await s.dave.client.mutation(api.mentorship.book, { teamId: anotherTeam, slotId: s.slotId });
  const carolBooking = await s.t.run(async (ctx) => ctx.db.query("mentorBookings").withIndex("by_slot_and_team", (q) => q.eq("slotId", s.slotId).eq("teamId", anotherTeam)).unique());
  await expect(s.bob.client.mutation(api.mentorship.cancel, { bookingId: carolBooking!._id, reason: "ajeno" })).rejects.toThrow("FORBIDDEN");
});

test("organizers can mark finished sessions as completed or no-show", async () => {
  const s = await setup();
  await s.owner.client.mutation(api.mentorship.setAttendance, { eventId: s.eventId, bookingId: s.pastBookingId, status: "no_show" });
  const schedule = await s.alice.client.query(api.mentorship.teamSchedule, { teamId: s.teamId, from: Date.now() });
  expect(schedule.bookings[0].status).toBe("no_show");
  await expect(s.alice.client.mutation(api.mentorship.setAttendance, { eventId: s.eventId, bookingId: s.pastBookingId, status: "completed" })).rejects.toThrow("FORBIDDEN");
});

test("organizers cannot publish overlapping mentor slots or insecure meeting links", async () => {
  const s = await setup();
  const mentorId = await s.t.run(async (ctx) => (await ctx.db.query("mentors").withIndex("by_event", (q) => q.eq("eventId", s.eventId)).first())!._id);
  await expect(s.owner.client.mutation(api.content.removeMentor, { eventId: s.eventId, id: mentorId })).rejects.toThrow("MENTOR_HAS_SCHEDULE");
  const now = Date.now();
  await expect(s.owner.client.mutation(api.mentorship.createSlot, {
    eventId: s.eventId, mentorId, startsAt: now + 50 * 60000, endsAt: now + 80 * 60000, capacity: 2,
  })).rejects.toThrow("MENTOR_SLOT_OVERLAP");
  await expect(s.owner.client.mutation(api.mentorship.createSlot, {
    eventId: s.eventId, mentorId, startsAt: now + 3 * 3600000, endsAt: now + 4 * 3600000,
    capacity: 2, meetingUrl: "http://example.test/meeting",
  })).rejects.toThrow("INVALID_MEETING_URL");
});
