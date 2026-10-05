/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  for (const name of [
    "events",
    "registrations",
    "submissions",
    "emailDeliveries",
  ])
    aggregateTest.register(t, `${name}Metrics`);
  const users = await t.run(async (ctx) => {
    const add = async (name: string, platformRole: "organizer" | "user") => {
      const userId = await ctx.db.insert("users", {
        wallet: name,
        tokenIdentifier: `test|${name}`,
        platformRole,
        name,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        tokenHash: name,
        network: "testnet",
        expiresAt: Date.now() + 60_000,
      });
      return { userId, sessionId };
    };
    return {
      owner: await add("owner", "organizer"),
      alice: await add("alice", "user"),
      bob: await add("bob", "user"),
      mentor: await add("mentor", "user"),
    };
  });
  const eventId = await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      slug: "hack-social",
      ownerId: users.owner.userId,
      type: "hackathon",
      status: "published",
      name: "Hack Social",
      format: "online",
      timezone: "UTC",
      timeline: {
        registrationOpensAt: 0,
        registrationClosesAt: 1,
        startsAt: 2,
        submissionOpensAt: 3,
        submissionClosesAt: 4,
        judgingClosesAt: 5,
      },
      settings: {
        admission: "auto",
        teamSizeMin: 1,
        teamSizeMax: 4,
        requiredCheckpoints: 0,
        judgesPerSubmission: 1,
        publicGallery: true,
      },
      theme: {
        mode: "dark",
        colors: {
          primary: "#fff",
          secondary: "#aaa",
          accent: "#ddd",
          background: "#050505",
          surface: "#111",
          text: "#fff",
        },
        fonts: { heading: "Inter", body: "Inter" },
        radius: "sm",
      },
      blocks: [],
      judgingClosed: false,
      resultsPublished: false,
      socialCards: {
        enabled: true,
        personalGalleryEnabled: false,
        projectCardsEnabled: true,
        templateId: "hacks-default",
        copyText: "Construimos en Hack Social",
        projectLinks: { repo: true, demo: false, video: false },
      },
    });
    await ctx.db.insert("eventStaff", {
      eventId,
      userId: users.owner.userId,
      role: "owner",
    });
    await ctx.db.insert("eventStaff", {
      eventId,
      userId: users.mentor.userId,
      role: "mentor",
    });
    for (const person of [users.alice, users.bob])
      await ctx.db.insert("registrations", {
        eventId,
        userId: person.userId,
        status: "approved",
        formVersion: 1,
        answers: {},
        consentAt: Date.now(),
        emailOptOut: false,
      });
    return eventId;
  });
  const client = (
    person: { userId: string; sessionId: string },
    name: string,
  ) =>
    t.withIdentity({
      issuer: "test",
      subject: name,
      tokenIdentifier: `test|${name}`,
      sessionId: person.sessionId,
    });
  return {
    t,
    eventId,
    owner: client(users.owner, "owner"),
    alice: client(users.alice, "alice"),
    bob: client(users.bob, "bob"),
    mentor: client(users.mentor, "mentor"),
  };
}

const config = {
  enabled: true,
  personalGalleryEnabled: true,
  projectCardsEnabled: true,
  templateId: "hacks-default",
  copyText: "Construimos en Hack Social",
  projectLinks: { repo: true, demo: false, video: false },
};

test("personal cards are owner-private until explicit opt-in and only accepted people can manage them", async () => {
  const s = await setup();
  expect(
    await s.alice.query(api.socialCards.my, { slug: "hack-social" }),
  ).toMatchObject({ role: "participant", published: false });
  expect(
    await s.mentor.query(api.socialCards.my, { slug: "hack-social" }),
  ).toMatchObject({ role: "mentor", published: false });
  expect(await s.bob.query(api.socialCards.my, { slug: "missing" })).toBeNull();
  await s.alice.mutation(api.socialCards.saveMine, {
    slug: "hack-social",
    displayName: "Alice Hacker",
    photoId: null,
  });
  expect(
    await s.bob.query(api.socialCards.my, { slug: "hack-social" }),
  ).toMatchObject({ displayName: "bob", published: false });
  expect(
    (
      await s.t.query(api.socialCards.personalGallery, {
        slug: "hack-social",
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page,
  ).toHaveLength(0);
  await expect(
    s.alice.mutation(api.socialCards.publishMine, {
      slug: "hack-social",
      publish: true,
    }),
  ).rejects.toThrow("PERSONAL_GALLERY_DISABLED");
  await s.owner.mutation(api.socialCards.configure, {
    eventId: s.eventId,
    settings: config,
  });
  const photoId = await s.t.run(async (ctx) => {
    const id = await ctx.storage.store(
      new Blob(["portrait"], { type: "image/png" }),
    );
    await ctx.db.insert("personalCardUploads", {
      eventId: s.eventId,
      userId: (await ctx.db
        .query("users")
        .withIndex("by_tokenIdentifier", (q) =>
          q.eq("tokenIdentifier", "test|alice"),
        )
        .unique())!._id,
      fileId: id,
      contentType: "image/png",
      createdAt: Date.now(),
    });
    return id;
  });
  await s.alice.mutation(api.socialCards.saveMine, {
    slug: "hack-social",
    displayName: "Alice Hacker",
    photoId,
  });
  const aliceUserId = await s.t.run(
    async (ctx) =>
      (await ctx.db
        .query("users")
        .withIndex("by_tokenIdentifier", (q) =>
          q.eq("tokenIdentifier", "test|alice"),
        )
        .unique())!._id,
  );
  const fileQuery = {
    slug: "hack-social",
    userId: aliceUserId,
  };
  expect(
    await s.alice.query(internal.socialCards.fileForPersonalCard, fileQuery),
  ).toBe(photoId);
  expect(
    await s.bob.query(internal.socialCards.fileForPersonalCard, fileQuery),
  ).toBeNull();
  expect(
    await s.t.query(internal.socialCards.fileForPersonalCard, fileQuery),
  ).toBeNull();
  await expect(
    s.bob.mutation(api.socialCards.saveMine, {
      slug: "hack-social",
      displayName: "Bob Hacker",
      photoId,
    }),
  ).rejects.toThrow("CARD_PHOTO_NOT_OWNED");
  expect(
    (await s.alice.query(api.socialCards.my, { slug: "hack-social" }))
      ?.photoUrl,
  ).toContain("/personal-card-photo?");
  await s.alice.mutation(api.socialCards.publishMine, {
    slug: "hack-social",
    publish: true,
  });
  expect(
    await s.t.query(internal.socialCards.fileForPersonalCard, fileQuery),
  ).toBe(photoId);
  const gallery = await s.t.query(api.socialCards.personalGallery, {
    slug: "hack-social",
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(gallery.page).toMatchObject([
    { displayName: "Alice Hacker", role: "participant" },
  ]);
  await s.alice.mutation(api.socialCards.publishMine, {
    slug: "hack-social",
    publish: false,
  });
  expect(
    await s.t.query(internal.socialCards.fileForPersonalCard, fileQuery),
  ).toBeNull();
  expect(
    (
      await s.t.query(api.socialCards.personalGallery, {
        slug: "hack-social",
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page,
  ).toHaveLength(0);
});

test("only event organizers can change card identity and copy settings", async () => {
  const s = await setup();
  await expect(
    s.mentor.mutation(api.socialCards.configure, {
      eventId: s.eventId,
      settings: config,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.owner.mutation(api.socialCards.configure, {
    eventId: s.eventId,
    settings: config,
  });
  expect(
    await s.owner.query(api.socialCards.organizerSettings, {
      eventId: s.eventId,
    }),
  ).toMatchObject(config);
});

test("project cards follow the existing results and public-gallery gates, with organizer-selected links", async () => {
  const s = await setup();
  const ids = await s.t.run(async (ctx) => {
    const aliceId = (await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", "test|alice"),
      )
      .unique())!._id;
    const teamId = await ctx.db.insert("teams", {
      eventId: s.eventId,
      name: "Team Alice",
      joinCode: "social-1",
      leaderId: aliceId,
      lookingForMembers: false,
      active: true,
    });
    await ctx.db.insert("teamMembers", {
      eventId: s.eventId,
      teamId,
      userId: aliceId,
      joinedAt: Date.now(),
    });
    const submissionId = await ctx.db.insert("submissions", {
      eventId: s.eventId,
      teamId,
      title: "Project",
      summary: "Built something",
      trackIds: [],
      repoUrl: "https://github.com/acme/project",
      demoUrl: "https://demo.example",
      imageIds: [],
      formVersion: 1,
      answers: {},
      status: "admitted",
      submittedAt: Date.now(),
    });
    return { teamId, submissionId };
  });
  const queryArgs = { slug: "hack-social", submissionId: ids.submissionId };
  expect(
    await s.alice.query(api.socialCards.projectMine, {
      submissionId: ids.submissionId,
    }),
  ).toMatchObject({
    title: "Project",
    repoUrl: "https://github.com/acme/project",
  });
  await expect(
    s.bob.query(api.socialCards.projectMine, {
      submissionId: ids.submissionId,
    }),
  ).rejects.toThrow("FORBIDDEN");
  expect(await s.t.query(api.socialCards.project, queryArgs)).toBeNull();
  await s.t.run(async (ctx) =>
    ctx.db.patch(s.eventId, { resultsPublished: true }),
  );
  expect(await s.t.query(api.socialCards.project, queryArgs)).toMatchObject({
    repoUrl: "https://github.com/acme/project",
    demoUrl: null,
  });
  await s.t.run(async (ctx) =>
    ctx.db.patch(s.eventId, {
      settings: {
        ...(await ctx.db.get(s.eventId))!.settings,
        publicGallery: false,
      },
    }),
  );
  expect(await s.t.query(api.socialCards.project, queryArgs)).toBeNull();
});
