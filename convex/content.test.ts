// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { test, expect, vi, afterEach } from "vitest";
import schema from "./schema";
import type { Doc } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { DEFAULT_THEME } from "./lib/eventTemplates";
import { contrast, THEME_PRESETS, validateBlocks } from "./lib/presentation";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.useRealTimers());
async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  async function person(name: string, role: "organizer" | "user" = "user") {
    const data = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        wallet: `wallet-${name}`,
        name,
        platformRole: role,
        tokenIdentifier: `test|${name}`,
        emailVerifiedAt: Date.now(),
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: id,
        network: "testnet",
        tokenHash: name,
        expiresAt: Date.now() + 7 * 86400000,
      });
      return { id, sessionId };
    });
    return {
      ...data,
      client: t.withIdentity({
        issuer: "test",
        subject: name,
        tokenIdentifier: `test|${name}`,
        sessionId: data.sessionId,
      }),
    };
  }
  const owner = await person("owner", "organizer"),
    other = await person("other"),
    reviewer = await person("reviewer");
  const eventId = await owner.client.mutation(api.manage.create, {
    name: "Un evento real",
    slug: "evento-real",
    type: "hackathon",
    timezone: "America/Lima",
  });
  const otherEvent = await owner.client.mutation(api.manage.create, {
    name: "Otro evento",
    slug: "otro-evento",
    type: "hackathon",
    timezone: "UTC",
  });
  await t.run((ctx) =>
    ctx.db.insert("eventStaff", {
      eventId,
      userId: reviewer.id,
      role: "reviewer",
    }),
  );
  return { t, owner, other, reviewer, eventId, otherEvent };
}
test("draft preview is private, publish serves only visible current blocks and archive removes catalog", async () => {
  const s = await setup();
  expect(await s.t.query(api.events.get, { slug: "evento-real" })).toBeNull();
  await expect(
    s.other.client.query(api.content.preview, { eventId: s.eventId }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.t.query(api.content.preview, { eventId: s.eventId }),
  ).rejects.toThrow("UNAUTHENTICATED");
  await s.owner.client.mutation(api.content.saveBlocks, {
    eventId: s.eventId,
    expectedVersion: 0,
    blocks: [
      {
        id: "hero",
        type: "hero",
        visible: true,
        content: { title: "Portada real" },
      },
      {
        id: "hidden",
        type: "about",
        visible: false,
        content: { markdown: "secreto" },
      },
      {
        id: "future",
        type: "rules",
        visible: true,
        visibleFrom: "results",
        content: { markdown: "futuro" },
      },
    ],
  });
  await s.owner.client.mutation(api.content.status, {
    eventId: s.eventId,
    status: "published",
  });
  const page = await s.t.query(api.events.get, { slug: "evento-real" });
  expect(page?.blocks.map((b) => b.id)).toEqual(["hero"]);
  expect(page).not.toHaveProperty("ownerId");
  expect((await s.t.query(api.events.list, {})).map((e) => e.slug)).toEqual([
    "evento-real",
  ]);
  await s.owner.client.mutation(api.content.status, {
    eventId: s.eventId,
    status: "archived",
  });
  expect(await s.t.query(api.events.get, { slug: "evento-real" })).toBeNull();
  expect(await s.t.query(api.events.list, {})).toEqual([]);
  await expect(
    s.owner.client.mutation(api.content.status, {
      eventId: s.eventId,
      status: "published",
    }),
  ).rejects.toThrow("RESTORE_DRAFT_FIRST");
  await s.owner.client.mutation(api.content.status, {
    eventId: s.eventId,
    status: "draft",
  });
});
test("public event pages omit judge profiles unless the visible judges section is published", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const judgeId = await ctx.db.insert("users", {
      wallet: "wallet-private-judge",
      name: "Private Judge Name",
      bio: "Private judge biography",
      platformRole: "user",
    });
    await ctx.db.insert("eventStaff", {
      eventId: s.eventId,
      userId: judgeId,
      role: "judge",
    });
  });
  await s.owner.client.mutation(api.content.saveBlocks, {
    eventId: s.eventId,
    expectedVersion: 0,
    blocks: [{ id: "hero", type: "hero", visible: true, content: {} }],
  });
  await s.owner.client.mutation(api.content.status, {
    eventId: s.eventId,
    status: "published",
  });

  const publicPage = await s.t.query(api.events.get, { slug: "evento-real" });
  expect(publicPage?.judges).toEqual([]);
  expect(JSON.stringify(publicPage)).not.toContain("Private Judge");
});
test("theme validates CSS values and font whitelist, permits low contrast, detects stale edits", async () => {
  const s = await setup();
  await expect(
    s.owner.client.mutation(api.content.saveTheme, {
      eventId: s.eventId,
      expectedVersion: 0,
      theme: {
        ...DEFAULT_THEME,
        colors: { ...DEFAULT_THEME.colors, accent: "url(javascript:alert(1))" },
      },
    }),
  ).rejects.toThrow("INVALID_THEME");
  await expect(
    s.owner.client.mutation(api.content.saveTheme, {
      eventId: s.eventId,
      expectedVersion: 0,
      theme: {
        ...DEFAULT_THEME,
        fonts: { heading: "evil; color:red", body: "Inter" },
      },
    }),
  ).rejects.toThrow("INVALID_THEME");
  const warnings = await s.owner.client.mutation(api.content.saveTheme, {
    eventId: s.eventId,
    expectedVersion: 0,
    theme: {
      ...DEFAULT_THEME,
      colors: { ...DEFAULT_THEME.colors, text: "#050505" },
    },
  });
  expect(warnings).toEqual(["LOW_CONTRAST_AA"]);
  expect(contrast("#050505", "#050505")).toBe(1);
  await expect(
    s.owner.client.mutation(api.content.saveBlocks, {
      eventId: s.eventId,
      expectedVersion: 0,
      blocks: [],
    }),
  ).rejects.toThrow("PRESENTATION_CONFLICT");
});
test("all built-in visual themes save through the event presentation validator", async () => {
  const s = await setup();
  const presets = [
    ["nocturnal", THEME_PRESETS.nocturnal],
    ["editorial", THEME_PRESETS.editorial],
    ["electric", THEME_PRESETS.electric],
    ["botanical", THEME_PRESETS.botanical],
  ] as const;
  for (const [index, [presetId, preset]] of presets.entries()) {
    const { label: _label, ...theme } = preset;
    await s.owner.client.mutation(api.content.saveTheme, {
      eventId: s.eventId,
      expectedVersion: index,
      theme: { ...theme, preset: presetId },
    });
  }
  expect((await s.owner.client.query(api.content.preview, { eventId: s.eventId })).theme.preset).toBe("botanical");
});
test("block content has bounded shape, stable unique IDs and safe URLs", () => {
  const b = { id: "a", type: "hero", visible: true, content: { title: "a" } };
  expect(() => validateBlocks([b, b])).toThrow("INVALID_BLOCKS");
  expect(() =>
    validateBlocks([{ ...b, content: { html: "<script>" } }]),
  ).toThrow("INVALID_BLOCK_FIELD");
  expect(() => validateBlocks([{ ...b, visibleFrom: "fake" }])).toThrow(
    "INVALID_BLOCK",
  );
  expect(() =>
    validateBlocks([
      {
        ...b,
        style: {
          width: "full",
          align: "center",
          spacing: "spacious",
          surface: "surface",
          backgroundColor: "#12ab34",
          textColor: "#ffffff",
        },
      },
    ]),
  ).not.toThrow();
  expect(() =>
    validateBlocks([
      {
        ...b,
        style: {
          width: "full",
          align: "center",
          spacing: "spacious",
          surface: "none",
          backgroundColor: "url(javascript:alert(1))",
          textColor: "#ffffff",
        },
      },
    ]),
  ).toThrow("INVALID_BLOCK_STYLE");
  expect(() =>
    validateBlocks([
      {
        ...b,
        type: "sponsors",
        content: { names: ["x"], urls: ["javascript:alert(1)"] },
      },
    ]),
  ).toThrow("INVALID_BLOCK_CONTENT");
  expect(() =>
    validateBlocks([
      {
        ...b,
        type: "faq",
        content: { questions: ["one", "two"], answers: ["one"] },
      },
    ]),
  ).toThrow("BLOCK_ROWS_MISMATCH");
  expect(() =>
    validateBlocks(
      Array.from({ length: 41 }, (_, i) => ({ ...b, id: String(i) })),
    ),
  ).toThrow("INVALID_BLOCKS");
});
test("reviewer cannot edit page, content or lifecycle; cross-event IDs rejected", async () => {
  const s = await setup();
  await expect(
    s.reviewer.client.mutation(api.content.saveTheme, {
      eventId: s.eventId,
      expectedVersion: 0,
      theme: DEFAULT_THEME,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.reviewer.client.mutation(api.content.status, {
      eventId: s.eventId,
      status: "published",
    }),
  ).rejects.toThrow("FORBIDDEN");
  const id = await s.owner.client.mutation(api.content.saveTrack, {
    eventId: s.otherEvent,
    name: "Track ajeno",
    description: "",
    prize: "",
    order: 0,
  });
  await expect(
    s.owner.client.mutation(api.content.removeTrack, {
      eventId: s.eventId,
      id,
    }),
  ).rejects.toThrow("NOT_FOUND");
  await expect(
    s.reviewer.client.mutation(api.content.saveTrack, {
      eventId: s.eventId,
      name: "Track",
      description: "",
      prize: "",
      order: 0,
    }),
  ).rejects.toThrow("FORBIDDEN");
});
test("resource access distinguishes anonymous, registered, approved and revoked staff", async () => {
  const s = await setup();
  const ids = [];
  for (const visibility of [
    "public",
    "registered",
    "approved",
    "staff",
  ] as const)
    ids.push(
      await s.owner.client.mutation(api.content.saveResource, {
        eventId: s.eventId,
        title: visibility,
        kind: "markdown",
        body: "guía",
        order: ids.length,
        visibility,
      }),
    );
  await s.owner.client.mutation(api.content.status, {
    eventId: s.eventId,
    status: "published",
  });
  expect(
    (await s.t.query(api.events.get, { slug: "evento-real" }))?.resources.map(
      (r) => r.title,
    ),
  ).toEqual(["public"]);
  expect(
    (
      await s.other.client.query(api.content.viewerResources, {
        slug: "evento-real",
      })
    ).map((r) => r.title),
  ).toEqual(["public"]);
  const registration = await s.t.run((ctx) =>
    ctx.db.insert("registrations", {
      eventId: s.eventId,
      userId: s.other.id,
      status: "pending",
      formVersion: 1,
      answers: {},
      consentAt: Date.now(),
      emailOptOut: false,
    }),
  );
  expect(
    (
      await s.other.client.query(api.content.viewerResources, {
        slug: "evento-real",
      })
    ).map((r) => r.title),
  ).toEqual(["public", "registered"]);
  await s.t.run((ctx) => ctx.db.patch(registration, { status: "approved" }));
  expect(
    (
      await s.other.client.query(api.content.viewerResources, {
        slug: "evento-real",
      })
    ).map((r) => r.title),
  ).toEqual(["public", "registered", "approved"]);
  expect(
    (
      await s.reviewer.client.query(api.content.viewerResources, {
        slug: "evento-real",
      })
    ).map((r) => r.title),
  ).toHaveLength(4);
  await s.t.run(async (ctx) => {
    const member = await ctx.db
      .query("eventStaff")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", s.eventId).eq("userId", s.reviewer.id),
      )
      .first();
    await ctx.db.patch(member!._id, { revokedAt: Date.now() });
  });
  expect(
    (
      await s.reviewer.client.query(api.content.viewerResources, {
        slug: "evento-real",
      })
    ).map((r) => r.title),
  ).toEqual(["public"]);
});
test("resources reject dangerous URLs and mentors expose contact only by explicit choice", async () => {
  const s = await setup();
  await expect(
    s.owner.client.mutation(api.content.saveResource, {
      eventId: s.eventId,
      title: "Inseguro",
      kind: "link",
      url: "javascript:alert(1)",
      order: 0,
      visibility: "public",
    }),
  ).rejects.toThrow("INVALID_URL");
  const id = await s.owner.client.mutation(api.content.saveMentor, {
    eventId: s.eventId,
    name: "Mentora",
    expertise: ["Soroban"],
    contact: "privado@example.com",
    availability: "Lunes",
    publicContact: false,
  });
  await s.owner.client.mutation(api.content.status, {
    eventId: s.eventId,
    status: "published",
  });
  expect(
    (await s.t.query(api.events.get, { slug: "evento-real" }))?.mentors[0],
  ).toMatchObject({ name: "Mentora", contact: "", availability: "Lunes" });
  await s.owner.client.mutation(api.content.saveMentor, {
    eventId: s.eventId,
    id,
    name: "Mentora",
    expertise: ["Soroban"],
    contact: "publico@example.com",
    availability: "Lunes",
    publicContact: true,
  });
  expect(
    (await s.t.query(api.events.get, { slug: "evento-real" }))?.mentors[0]
      .contact,
  ).toBe("publico@example.com");
  await expect(
    s.owner.client.mutation(api.content.removeMentor, {
      eventId: s.otherEvent,
      id,
    }),
  ).rejects.toThrow("NOT_FOUND");
});
test("same-event ownership and asset type validated before attaching files or images", async () => {
  const s = await setup();
  const fileId = await s.t.run((ctx) =>
    ctx.storage.store(new Blob(["text"], { type: "text/plain" })),
  );
  await expect(
    s.owner.client.mutation(api.content.saveResource, {
      eventId: s.eventId,
      title: "Archivo",
      kind: "file",
      fileId,
      order: 0,
      visibility: "public",
    }),
  ).rejects.toThrow("INVALID_ASSET");
  await s.owner.client.mutation(internal.media.registerUpload, {
    eventId: s.eventId,
    fileId,
    kind: "resource",
    name: "text.txt",
    contentType: "text/plain",
  });
  await s.owner.client.mutation(api.content.saveResource, {
    eventId: s.eventId,
    title: "Archivo",
    kind: "file",
    fileId,
    order: 0,
    visibility: "public",
  });
  await expect(
    s.owner.client.mutation(api.content.saveTheme, {
      eventId: s.eventId,
      expectedVersion: 0,
      theme: { ...DEFAULT_THEME, logoId: fileId },
    }),
  ).rejects.toThrow("INVALID_ASSET");
  await expect(
    s.owner.client.mutation(api.content.saveResource, {
      eventId: s.otherEvent,
      title: "Ajeno",
      kind: "file",
      fileId,
      order: 0,
      visibility: "public",
    }),
  ).rejects.toThrow("INVALID_ASSET");
});
test("HTTP download enforces current resource visibility and never exposes storage ID publicly", async () => {
  const s = await setup(),
    fileId = await s.t.run((ctx) =>
      ctx.storage.store(new Blob(["contenido"], { type: "text/plain" })),
    );
  await s.owner.client.mutation(internal.media.registerUpload, {
    eventId: s.eventId,
    fileId,
    kind: "resource",
    name: "guia.txt",
    contentType: "text/plain",
  });
  const input = {
    eventId: s.eventId,
    title: "Guía archivo",
    kind: "file" as const,
    fileId,
    order: 0,
    visibility: "public" as const,
  };
  const id = await s.owner.client.mutation(api.content.saveResource, input);
  expect((await s.t.fetch(`/event-file?resourceId=${id}`)).status).toBe(404);
  await s.owner.client.mutation(api.content.status, {
    eventId: s.eventId,
    status: "published",
  });
  const response = await s.t.fetch(`/event-file?resourceId=${id}`);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("contenido");
  const page = await s.t.query(api.events.get, { slug: "evento-real" });
  expect(page?.resources[0]).not.toHaveProperty("fileId");
  expect(JSON.stringify(page)).not.toContain(fileId);
  await s.owner.client.mutation(api.content.saveResource, {
    ...input,
    id,
    visibility: "staff",
  });
  expect((await s.t.fetch(`/event-file?resourceId=${id}`)).status).toBe(404);
  expect(
    (await s.owner.client.fetch(`/event-file?resourceId=${id}`)).status,
  ).toBe(200);
});
test("HTTP upload requires active permissions and validates file content", async () => {
  const s = await setup(),
    path = `/event-upload?eventId=${s.eventId}&kind=image`;
  expect(
    (
      await s.t.fetch(path, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: "fake",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await s.reviewer.client.fetch(path, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: "fake",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await s.owner.client.fetch(path, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: "fake",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await s.owner.client.fetch(path, {
        method: "POST",
        headers: { "Content-Type": "image/svg+xml" },
        body: "<svg>",
      })
    ).status,
  ).toBe(400);
  const upload = await s.owner.client.fetch(
    `/event-upload?eventId=${s.eventId}&kind=resource`,
    {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-File-Name": "guia.txt" },
      body: "hola",
    },
  );
  expect(upload.status).toBe(200);
  const { fileId } = await upload.json();
  const assets = await s.owner.client.query(api.media.list, {
    eventId: s.eventId,
    kind: "resource",
  });
  expect(assets).toMatchObject([{ fileId, name: "guia.txt", url: null }]);
});
test("timeline changes materialize reactive phase; stale scheduled jobs cannot revive archived events", async () => {
  const s = await setup();
  await s.owner.client.mutation(api.content.status, {
    eventId: s.eventId,
    status: "published",
  });
  const event = await s.t.run((ctx) => ctx.db.get(s.eventId));
  expect(event?.registrationOpen).toBe(true);
  const oldRevision = event!.phaseRevision!;
  vi.setSystemTime(event!.timeline.submissionClosesAt + 1);
  await s.t.mutation(internal.eventContentData.refreshPhase, {
    eventId: s.eventId,
    revision: oldRevision,
  });
  expect(
    (await s.t.query(api.events.get, { slug: "evento-real" }))?.phase,
  ).toBe("judging");
  vi.setSystemTime(event!.timeline.registrationOpensAt + 1000);
  await s.owner.client.mutation(api.content.status, {
    eventId: s.eventId,
    status: "archived",
  });
  await s.t.mutation(internal.eventContentData.refreshPhase, {
    eventId: s.eventId,
    revision: oldRevision,
  });
  const archived = await s.t.run((ctx) => ctx.db.get(s.eventId));
  expect(archived?.publicPhase).toBe("closed");
  expect(archived?.registrationOpen).toBe(false);
});
test("archived event is immutable and restoring counts active-event quota", async () => {
  const s = await setup();
  await s.owner.client.mutation(api.content.status, {
    eventId: s.eventId,
    status: "archived",
  });
  await expect(
    s.owner.client.mutation(api.content.saveTrack, {
      eventId: s.eventId,
      name: "No",
      description: "",
      prize: "",
      order: 0,
    }),
  ).rejects.toThrow("EVENT_ARCHIVED");
  await s.t.run((ctx) => ctx.db.patch(s.owner.id, { eventLimit: 1 }));
  await expect(
    s.owner.client.mutation(api.content.status, {
      eventId: s.eventId,
      status: "draft",
    }),
  ).rejects.toThrow("EVENT_QUOTA_REACHED");
});
test("presentation changes and publication leave audit records, publish requires a visible hero", async () => {
  const s = await setup();
  await s.owner.client.mutation(api.content.saveBlocks, {
    eventId: s.eventId,
    expectedVersion: 0,
    blocks: [],
  });
  await expect(
    s.owner.client.mutation(api.content.status, {
      eventId: s.eventId,
      status: "published",
    }),
  ).rejects.toThrow("VISIBLE_HERO_REQUIRED");
  const audit = await s.owner.client.query(api.manage.audit, {
    eventId: s.eventId,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(audit.page.some((a) => a.action === "page.update")).toBe(true);
  expect(audit.page.some((a) => a.action === "event.status")).toBe(false);
});

test("gallery image assets stay scoped to their event and hidden blocks do not leak image URLs", async () => {
  const s = await setup();
  const fileId = await s.t.run((ctx) =>
    ctx.storage.store(
      new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
    ),
  );
  await s.owner.client.mutation(internal.media.registerUpload, {
    eventId: s.eventId,
    fileId,
    kind: "image",
    name: "photo.png",
    contentType: "image/png",
  });
  const blocks: Doc<"events">["blocks"] = [
    { id: "hero", type: "hero", visible: true, content: {} },
    {
      id: "gallery",
      type: "gallery",
      visible: false,
      content: { imageIds: [fileId], captions: ["Comunidad"] },
    },
  ];
  await s.owner.client.mutation(api.content.saveBlocks, {
    eventId: s.eventId,
    expectedVersion: 0,
    blocks,
  });
  await expect(
    s.owner.client.mutation(api.content.saveBlocks, {
      eventId: s.otherEvent,
      expectedVersion: 0,
      blocks,
    }),
  ).rejects.toThrow("INVALID_ASSET");
  await s.owner.client.mutation(api.content.status, {
    eventId: s.eventId,
    status: "published",
  });
  const publicPage = await s.t.query(api.events.get, { slug: "evento-real" });
  expect(publicPage?.images).toEqual({});
  expect(JSON.stringify(publicPage)).not.toContain(fileId);
  const preview = await s.owner.client.query(api.content.preview, {
    eventId: s.eventId,
  });
  expect(preview.images[fileId]).toMatch(/^https?:/);
});
