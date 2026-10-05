// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { test, expect } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of [
    "events",
    "registrations",
    "submissions",
    "emailDeliveries",
  ])
    aggregateTest.register(t, `${name}Metrics`);
  async function person(
    name: string,
    role: "superadmin" | "organizer" | "user",
  ) {
    const ids = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        wallet: name,
        name,
        email: `${name}@example.com`,
        emailVerifiedAt: Date.now(),
        tokenIdentifier: `test|${name}`,
        platformRole: role,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: id,
        tokenHash: name,
        network: "testnet",
        expiresAt: Date.now() + 86400000,
      });
      return { id, sessionId };
    });
    return {
      ...ids,
      client: t.withIdentity({
        issuer: "test",
        subject: name,
        tokenIdentifier: `test|${name}`,
        sessionId: ids.sessionId,
      }),
    };
  }
  const admin = await person("admin", "superadmin"),
    owner = await person("owner", "organizer"),
    outsider = await person("outsider", "user");
  const eventId = await owner.client.mutation(api.manage.create, {
    name: "Prueba de administración",
    slug: "admin-test",
    type: "hackathon",
    timezone: "UTC",
  });
  return { t, admin, owner, outsider, eventId };
}
test("admin only: suspensions revoke sessions permanently, preserve protected admins and audit reasons", async () => {
  const { admin, owner, outsider, t } = await setup();
  await expect(
    outsider.client.query(api.admin.users, {
      paginationOpts: { numItems: 20, cursor: null },
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    owner.client.mutation(api.admin.suspendUser, {
      userId: outsider.id,
      suspended: true,
      reason: "Abuso",
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    admin.client.mutation(api.admin.suspendUser, {
      userId: admin.id,
      suspended: true,
      reason: "Abuso",
    }),
  ).rejects.toThrow("PROTECTED_USER");
  await admin.client.mutation(api.admin.suspendUser, {
    userId: owner.id,
    suspended: true,
    reason: "Revisión de cuenta",
  });
  await expect(owner.client.query(api.users.me, {})).rejects.toThrow(
    "FORBIDDEN",
  );
  await admin.client.mutation(api.admin.suspendUser, {
    userId: owner.id,
    suspended: false,
    reason: "Revisión completada",
  });
  await expect(owner.client.query(api.users.me, {})).rejects.toThrow(
    "SESSION_EXPIRED",
  );
  const logs = await admin.client.query(api.admin.audit, {
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(
    logs.page.some(
      (l) =>
        l.action === "admin.user.suspend" && l.reason === "Revisión de cuenta",
    ),
  ).toBe(true);
  expect((await t.run((ctx) => ctx.db.get(owner.id)))?.sessionVersion).toBe(2);
});
test("event suspension blocks owners, hides public data, restores previous status and audits access", async () => {
  const { t, admin, owner, eventId } = await setup();
  await t.run((ctx) => ctx.db.patch(eventId, { status: "published" }));
  await admin.client.mutation(api.admin.suspendEvent, {
    eventId,
    suspended: true,
    reason: "Incumplimiento del evento",
  });
  expect(await t.query(api.events.get, { slug: "admin-test" })).toBeNull();
  await expect(
    owner.client.query(api.manage.audit, {
      eventId,
      paginationOpts: { numItems: 20, cursor: null },
    }),
  ).rejects.toThrow("FORBIDDEN");
  expect(await admin.client.mutation(api.admin.enterEvent, { eventId })).toBe(
    "admin-test",
  );
  await admin.client.mutation(api.admin.suspendEvent, {
    eventId,
    suspended: false,
    reason: "Evento corregido",
  });
  expect((await t.run((ctx) => ctx.db.get(eventId)))?.status).toBe("published");
  expect(
    (
      await admin.client.query(api.admin.audit, {
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page.some((l) => l.action === "admin.event.enter"),
  ).toBe(true);
});
test("aggregate backfill is idempotent and live status changes preserve totals", async () => {
  const { t, admin, eventId } = await setup();
  for (const table of [
    "events",
    "registrations",
    "submissions",
    "emailDeliveries",
  ] as const) {
    await admin.client.mutation(api.adminMetrics.backfill, {
      table,
      cursor: null,
    });
    await admin.client.mutation(api.adminMetrics.backfill, {
      table,
      cursor: null,
    });
  }
  expect(await admin.client.query(api.adminMetrics.totals, {})).toEqual({
    events: 1,
    registrations: 0,
    projects: 0,
    emails: 0,
  });
  await admin.client.mutation(api.admin.suspendEvent, {
    eventId,
    suspended: true,
    reason: "Prueba suspensión",
  });
  expect((await admin.client.query(api.adminMetrics.totals, {})).events).toBe(
    1,
  );
  await expect(t.query(api.adminMetrics.totals, {})).rejects.toThrow(
    "UNAUTHENTICATED",
  );
});
test("gallery exposes only admitted safe project fields and respects event visibility", async () => {
  const { t, eventId, owner, admin } = await setup();
  await t.run(async (ctx) => {
    const event = await ctx.db.get(eventId);
    await ctx.db.patch(eventId, {
      status: "published",
      resultsPublished: true,
      settings: { ...event!.settings, publicGallery: true },
    });
    const teamId = await ctx.db.insert("teams", {
      eventId,
      name: "Equipo público",
      joinCode: "PRIVATE",
      leaderId: owner.id,
      lookingForMembers: false,
      active: true,
    });
    for (const status of [
      "draft",
      "submitted",
      "admitted",
      "disqualified",
    ] as const)
      await ctx.db.insert("submissions", {
        eventId,
        teamId,
        title: status,
        summary: "Resumen público",
        trackIds: [],
        imageIds: [],
        formVersion: 1,
        answers: { private: "PII" },
        status,
        repoUrl: "javascript:alert(1)",
        demoUrl: "https://example.com",
        reviewReason: "Nota privada",
      });
  });
  const args = {
    slug: "admin-test",
    paginationOpts: { numItems: 20, cursor: null },
  };
  await t.run((ctx) => ctx.db.patch(eventId, { resultsPublished: false }));
  expect((await t.query(api.gallery.list, args)).page).toEqual([]);
  await t.run((ctx) => ctx.db.patch(eventId, { resultsPublished: true }));
  const page = await t.query(api.gallery.list, args);
  expect(page.page).toHaveLength(1);
  expect(page.page[0].title).toBe("admitted");
  expect(page.page[0].repoUrl).toBeNull();
  expect(JSON.stringify(page)).not.toMatch(/PII|PRIVATE|Nota privada/);
  await admin.client.mutation(api.admin.suspendEvent, {
    eventId,
    suspended: true,
    reason: "Revisión",
  });
  expect((await t.query(api.gallery.list, args)).page).toEqual([]);
  await admin.client.mutation(api.admin.suspendEvent, {
    eventId,
    suspended: false,
    reason: "Restaurado",
  });
  await t.run(async (ctx) => {
    const e = await ctx.db.get(eventId);
    await ctx.db.patch(eventId, {
      settings: { ...e!.settings, publicGallery: false },
    });
  });
  expect((await t.query(api.gallery.list, args)).page).toEqual([]);
});

test("gallery image requests refuse private uploads and revoke access immediately", async () => {
  const { t, owner, eventId, admin } = await setup();
  const { projectId, imageId, privateId } = await t.run(async (ctx) => {
    const e = await ctx.db.get(eventId);
    await ctx.db.patch(eventId, {
      status: "published",
      resultsPublished: true,
      settings: { ...e!.settings, publicGallery: true },
    });
    const teamId = await ctx.db.insert("teams", {
      eventId,
      name: "Galería",
      leaderId: owner.id,
      joinCode: "PRIVATE",
      lookingForMembers: false,
    });
    const imageId = await ctx.storage.store(
      new Blob(["public image"], { type: "image/png" }),
    );
    const privateId = await ctx.storage.store(
      new Blob(["private file"], { type: "image/png" }),
    );
    for (const [fileId, kind] of [
      [imageId, "image"],
      [privateId, "submission"],
    ] as const)
      await ctx.db.insert("projectUploads", {
        eventId,
        teamId,
        userId: owner.id,
        fileId,
        kind,
        fieldId: "private",
        name: "archivo",
      });
    const projectId = await ctx.db.insert("submissions", {
      eventId,
      teamId,
      title: "Público",
      summary: "Resumen",
      status: "admitted",
      trackIds: [],
      imageIds: [imageId, privateId],
      formVersion: 1,
      answers: {},
    });
    return { projectId, imageId, privateId };
  });
  const path = (image: string) =>
    `/gallery-image?projectId=${projectId}&imageId=${image}`;
  expect(await t.query(internal.gallery.image, { projectId, imageId })).toBe(
    imageId,
  );
  expect((await t.fetch(path(imageId))).status).toBe(200);
  expect((await t.fetch(path(privateId))).status).toBe(404);
  expect(
    (await t.fetch("/gallery-image?projectId=invalid&imageId=invalid")).status,
  ).toBe(404);
  await admin.client.mutation(api.admin.suspendEvent, {
    eventId,
    suspended: true,
    reason: "Bloquear imágenes",
  });
  expect((await t.fetch(path(imageId))).status).toBe(404);
});

test("organizer quotas reject invalid values and audit the new limit", async () => {
  const { admin, owner, outsider } = await setup();
  await expect(
    admin.client.mutation(api.admin.setEventLimit, {
      userId: owner.id,
      limit: 1.5,
    }),
  ).rejects.toThrow("INVALID_QUOTA");
  await expect(
    admin.client.mutation(api.admin.setEventLimit, {
      userId: outsider.id,
      limit: 2,
    }),
  ).rejects.toThrow("ORGANIZER_REQUIRED");
  await admin.client.mutation(api.admin.setEventLimit, {
    userId: owner.id,
    limit: 5,
  });
  expect((await owner.client.query(api.users.me, {})).eventLimit).toBe(5);
});
