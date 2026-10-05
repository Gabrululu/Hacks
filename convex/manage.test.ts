// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { expect, test, vi, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
const paginationOpts = { numItems: 20, cursor: null };
afterEach(() => vi.useRealTimers());
async function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  async function person(
    label: string,
    platformRole: "user" | "organizer" | "superadmin",
  ) {
    const wallet = Keypair.random().publicKey();
    const ids = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        wallet,
        name: label,
        email: `${label}@example.com`,
        emailVerifiedAt: Date.now(),
        tokenIdentifier: `test|${label}`,
        platformRole,
        eventLimit: 3,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: id,
        tokenHash: label,
        network: "testnet",
        expiresAt: Date.now() + 7 * 86400000,
      });
      return { id, sessionId };
    });
    return {
      ...ids,
      wallet,
      client: t.withIdentity({
        tokenIdentifier: `test|${label}`,
        issuer: "test",
        subject: label,
        sessionId: ids.sessionId,
      }),
    };
  }
  const owner = await person("owner", "organizer"),
    applicant = await person("applicant", "user"),
    other = await person("other", "user"),
    admin = await person("admin", "superadmin");
  const eventId = await owner.client.mutation(api.manage.create, {
    name: "Nuestro hackathon",
    slug: "nuestro-hackathon",
    type: "hackathon",
    timezone: "America/Lima",
  });
  return { t, owner, applicant, other, admin, eventId };
}
const application = {
  org: "Comunidad Stellar",
  motivation:
    "Queremos organizar un hackathon para construir soluciones útiles en comunidad.",
  links: ["https://stellar.org"],
};
async function getInput(s: Awaited<ReturnType<typeof setup>>) {
  const event = (await s.owner.client.query(api.manage.detail, {
    slug: "nuestro-hackathon",
  }))!.event;
  return {
    name: event.name,
    tagline: event.tagline ?? "",
    description: event.description ?? "",
    format: event.format,
    location: event.location ?? "",
    timezone: event.timezone,
    timeline: event.timeline,
    settings: event.settings,
  };
}
test("organizer application is private and only admin can approve", async () => {
  const s = await setup();
  await expect(
    s.t.mutation(api.organizers.submit, application),
  ).rejects.toThrow("UNAUTHENTICATED");
  const id = await s.applicant.client.mutation(
    api.organizers.submit,
    application,
  );
  expect(await s.other.client.query(api.organizers.mine, {})).toBeNull();
  await expect(
    s.applicant.client.query(api.organizers.list, {
      status: "pending",
      paginationOpts,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.applicant.client.mutation(api.organizers.review, {
      applicationId: id,
      decision: "approved",
      note: "",
      eventLimit: 2,
    }),
  ).rejects.toThrow("FORBIDDEN");
  const result = await s.admin.client.query(api.organizers.list, {
    status: "pending",
    paginationOpts,
  });
  expect(result.page[0].applicant.wallet).toBe(s.applicant.wallet);
  await s.admin.client.mutation(api.organizers.review, {
    applicationId: id,
    decision: "approved",
    note: "Bienvenido",
    eventLimit: 2,
  });
  expect(await s.applicant.client.query(api.users.me, {})).toMatchObject({
    platformRole: "organizer",
    eventLimit: 2,
  });
  await expect(
    s.admin.client.mutation(api.organizers.review, {
      applicationId: id,
      decision: "approved",
      note: "",
      eventLimit: 2,
    }),
  ).rejects.toThrow("APPLICATION_NOT_PENDING");
});

test("event subdomains are validated, unique, and resolve only published events", async () => {
  const s = await setup();

  await expect(
    s.other.client.mutation(api.domains.setSubdomain, {
      eventId: s.eventId,
      domainSlug: "stellar",
    }),
  ).rejects.toThrow("FORBIDDEN");

  await expect(
    s.owner.client.mutation(api.domains.setSubdomain, {
      eventId: s.eventId,
      domainSlug: "admin",
    }),
  ).rejects.toThrow("RESERVED_DOMAIN_SLUG");
  await expect(
    s.owner.client.mutation(api.domains.setSubdomain, {
      eventId: s.eventId,
      domainSlug: "bad--slug",
    }),
  ).rejects.toThrow("INVALID_DOMAIN_SLUG");

  await s.owner.client.mutation(api.domains.setSubdomain, {
    eventId: s.eventId,
    domainSlug: "stellar",
  });
  expect(await s.t.query(api.events.getByDomain, { domainSlug: "stellar" })).toBeNull();

  const secondEventId = await s.owner.client.mutation(api.manage.create, {
    name: "Otro hackathon",
    slug: "otro-hackathon",
    type: "hackathon",
    timezone: "America/Lima",
  });
  await expect(
    s.owner.client.mutation(api.domains.setSubdomain, {
      eventId: secondEventId,
      domainSlug: "stellar",
    }),
  ).rejects.toThrow("EVENT_DOMAIN_TAKEN");

  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.eventId, { status: "published" });
  });
  expect(await s.t.query(api.events.getByDomain, { domainSlug: "STELLAR" })).toMatchObject({
    slug: "nuestro-hackathon",
    name: "Nuestro hackathon",
  });

  await s.owner.client.mutation(api.domains.setSubdomain, {
    eventId: s.eventId,
    domainSlug: null,
  });
  expect(await s.t.query(api.events.getByDomain, { domainSlug: "stellar" })).toBeNull();
});

test("organization members share owner access only on linked events", async () => {
  const s = await setup();
  await s.t.run((ctx) => ctx.db.patch(s.applicant.id, { platformRole: "organizer" }));
  const organizationId = await s.owner.client.mutation(api.organizations.create, {
    name: "Comunidad Hacks",
    slug: "comunidad-hacks",
  });
  await s.owner.client.mutation(api.organizations.addOrganizer, {
    organizationId,
    wallet: s.applicant.wallet,
  });
  await s.owner.client.mutation(api.organizations.attachEvent, {
    organizationId,
    slug: "nuestro-hackathon",
  });
  const shared = await s.applicant.client.query(api.manage.detail, {
    slug: "nuestro-hackathon",
  });
  expect(shared?.role).toBe("owner");
  expect(shared?.permissions).toContain("event.delete");
  await s.owner.client.mutation(api.organizations.removeOrganizer, {
    organizationId,
    userId: s.applicant.id,
  });
  expect(await s.applicant.client.query(api.manage.detail, {
    slug: "nuestro-hackathon",
  })).toBeNull();
});
test("application requires profile, bounds fields, prevents duplicates and permits resubmission after rejection", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.patch(s.applicant.id, { emailVerifiedAt: undefined }),
  );
  await expect(
    s.applicant.client.mutation(api.organizers.submit, application),
  ).rejects.toThrow("PROFILE_INCOMPLETE");
  await s.t.run((ctx) =>
    ctx.db.patch(s.applicant.id, { emailVerifiedAt: Date.now() }),
  );
  await expect(
    s.applicant.client.mutation(api.organizers.submit, {
      ...application,
      links: ["javascript:alert(1)"],
    }),
  ).rejects.toThrow("INVALID_LINK");
  await expect(
    s.applicant.client.mutation(api.organizers.submit, {
      ...application,
      motivation: "short",
    }),
  ).rejects.toThrow("INVALID_APPLICATION");
  const id = await s.applicant.client.mutation(
    api.organizers.submit,
    application,
  );
  await expect(
    s.applicant.client.mutation(api.organizers.submit, application),
  ).rejects.toThrow("APPLICATION_PENDING");
  await s.admin.client.mutation(api.organizers.review, {
    applicationId: id,
    decision: "rejected",
    note: "Más detalle",
    eventLimit: 3,
  });
  expect((await s.applicant.client.query(api.users.me, {})).platformRole).toBe(
    "user",
  );
  const next = await s.applicant.client.mutation(
    api.organizers.submit,
    application,
  );
  expect(next).not.toBe(id);
});
test("events are private drafts with owner membership and type-specific defaults", async () => {
  const s = await setup();
  expect(await s.t.query(api.events.list, {})).toEqual([]);
  expect(
    await s.other.client.query(api.manage.detail, {
      slug: "nuestro-hackathon",
    }),
  ).toBeNull();
  expect(
    (await s.other.client.query(api.manage.mine, { paginationOpts })).page,
  ).toEqual([]);
  const detail = await s.owner.client.query(api.manage.detail, {
    slug: "nuestro-hackathon",
  });
  expect(detail).toMatchObject({
    role: "owner",
    event: { status: "draft", ownerId: s.owner.id },
  });
  expect(detail?.permissions).toContain("staff.manage");
  const id = await s.owner.client.mutation(api.manage.create, {
    name: "Buildathon",
    slug: "buildathon",
    type: "buildathon",
    timezone: "UTC",
  });
  const build = await s.t.run((ctx) => ctx.db.get(id));
  expect(build?.settings.requiredCheckpoints).toBe(4);
  expect(build?.blocks.map((b) => b.type)).toEqual([
    "hero",
    "about",
    "timeline",
  ]);
  const bootcamp = await s.owner.client.mutation(api.manage.create, {
    name: "Bootcamp",
    slug: "bootcamp",
    type: "bootcamp",
    timezone: "UTC",
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(bootcamp)))?.settings.teamSizeMax,
  ).toBe(1);
});
test("event creation checks organizer role, slug uniqueness, timezone and active quota", async () => {
  const s = await setup();
  const args = {
    name: "Otro evento",
    slug: "otro-evento",
    type: "hackathon" as const,
    timezone: "UTC",
  };
  await expect(
    s.other.client.mutation(api.manage.create, args),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.owner.client.mutation(api.manage.create, {
      ...args,
      slug: "nuestro-hackathon",
    }),
  ).rejects.toThrow("SLUG_TAKEN");
  await expect(
    s.owner.client.mutation(api.manage.create, {
      ...args,
      slug: "Invalid/url",
    }),
  ).rejects.toThrow("INVALID_SLUG");
  await expect(
    s.owner.client.mutation(api.manage.create, {
      ...args,
      timezone: "Invalid/Time",
    }),
  ).rejects.toThrow("INVALID_TIMEZONE");
  await s.t.run((ctx) => ctx.db.patch(s.owner.id, { eventLimit: 1 }));
  await expect(
    s.owner.client.mutation(api.manage.create, args),
  ).rejects.toThrow("EVENT_QUOTA_REACHED");
  await s.t.run((ctx) => ctx.db.patch(s.eventId, { status: "archived" }));
  await s.owner.client.mutation(api.manage.create, args);
});
test("event updates validate timeline and settings on server, keep immutable fields and audit", async () => {
  const s = await setup();
  const input = await getInput(s);
  await expect(
    s.other.client.mutation(api.manage.update, {
      eventId: s.eventId,
      ...input,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.owner.client.mutation(api.manage.update, {
      eventId: s.eventId,
      ...input,
      timeline: {
        ...input.timeline,
        submissionClosesAt: input.timeline.startsAt - 1,
      },
    }),
  ).rejects.toThrow("INVALID_TIMELINE");
  await expect(
    s.owner.client.mutation(api.manage.update, {
      eventId: s.eventId,
      ...input,
      settings: { ...input.settings, teamSizeMin: 6, teamSizeMax: 5 },
    }),
  ).rejects.toThrow("INVALID_SETTINGS");
  await expect(
    s.owner.client.mutation(api.manage.update, {
      eventId: s.eventId,
      ...input,
      settings: { ...input.settings, admission: "capped", capacity: undefined },
    }),
  ).rejects.toThrow("INVALID_SETTINGS");
  await s.owner.client.mutation(api.manage.update, {
    eventId: s.eventId,
    ...input,
    name: "Nuevo nombre",
  });
  expect(
    (
      await s.owner.client.query(api.manage.detail, {
        slug: "nuestro-hackathon",
      })
    )?.event.name,
  ).toBe("Nuevo nombre");
  expect(
    (
      await s.owner.client.query(api.manage.audit, {
        eventId: s.eventId,
        paginationOpts,
      })
    ).page.map((log) => log.action),
  ).toContain("event.update");
});
test("wallet-bound staff invitation uses a hash, validates recipient and is single-use", async () => {
  const s = await setup();
  const invite = await s.owner.client.action(api.staffActions.invite, {
    eventId: s.eventId,
    role: "judge",
    wallet: s.other.wallet,
  });
  const stored = await s.t.run((ctx) => ctx.db.get(invite.id));
  expect(stored?.tokenHash).not.toBe(invite.token);
  await expect(
    s.applicant.client.action(api.staffActions.accept, { token: invite.token }),
  ).rejects.toThrow("WALLET_MISMATCH");
  await s.other.client.action(api.staffActions.accept, { token: invite.token });
  const detail = await s.other.client.query(api.manage.detail, {
    slug: "nuestro-hackathon",
  });
  expect(detail?.permissions).toEqual(["judging.score"]);
  await expect(
    s.other.client.query(api.staff.list, {
      eventId: s.eventId,
      paginationOpts,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.other.client.action(api.staffActions.accept, { token: invite.token }),
  ).rejects.toThrow("INVITE_UNAVAILABLE");
});
test("invitations refuse anonymous callers, invalid wallets and cross-event managers", async () => {
  const s = await setup();
  await expect(
    s.t.action(api.staffActions.invite, { eventId: s.eventId, role: "mentor" }),
  ).rejects.toThrow("UNAUTHENTICATED");
  await expect(
    s.other.client.action(api.staffActions.invite, {
      eventId: s.eventId,
      role: "mentor",
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.owner.client.action(api.staffActions.invite, {
      eventId: s.eventId,
      role: "mentor",
      wallet: "GNOTVALID",
    }),
  ).rejects.toThrow("INVALID_WALLET");
  await expect(
    s.other.client.action(api.staffActions.accept, { token: "not-a-token" }),
  ).rejects.toThrow("INVITE_UNAVAILABLE");
});
test("expired or revoked invitations cannot be claimed", async () => {
  const s = await setup();
  const invite = await s.owner.client.action(api.staffActions.invite, {
    eventId: s.eventId,
    role: "mentor",
  });
  await s.owner.client.mutation(api.staff.revokeInvite, {
    eventId: s.eventId,
    inviteId: invite.id,
  });
  await expect(
    s.other.client.action(api.staffActions.accept, { token: invite.token }),
  ).rejects.toThrow("INVITE_UNAVAILABLE");
  const expired = await s.owner.client.action(api.staffActions.invite, {
    eventId: s.eventId,
    role: "mentor",
  });
  await s.t.run((ctx) =>
    ctx.db.patch(expired.id, { expiresAt: Date.now() - 1 }),
  );
  await expect(
    s.other.client.action(api.staffActions.accept, { token: expired.token }),
  ).rejects.toThrow("INVITE_UNAVAILABLE");
});
test("staff revocation removes access and invalidates invitations created before revocation", async () => {
  vi.useFakeTimers();
  const s = await setup();
  const invite = await s.owner.client.action(api.staffActions.invite, {
    eventId: s.eventId,
    role: "co_organizer",
  });
  await s.other.client.action(api.staffActions.accept, { token: invite.token });
  const old = await s.owner.client.action(api.staffActions.invite, {
    eventId: s.eventId,
    role: "mentor",
  });
  const rows = await s.owner.client.query(api.staff.list, {
    eventId: s.eventId,
    paginationOpts,
  });
  const memberId = rows.page.find((row) => row.member.userId === s.other.id)!
    .member._id;
  vi.advanceTimersByTime(10);
  await s.owner.client.mutation(api.staff.revoke, {
    eventId: s.eventId,
    memberId,
  });
  expect(
    await s.other.client.query(api.manage.detail, {
      slug: "nuestro-hackathon",
    }),
  ).toBeNull();
  expect(
    (await s.other.client.query(api.manage.mine, { paginationOpts })).page,
  ).toHaveLength(0);
  await expect(
    s.other.client.mutation(api.manage.update, {
      eventId: s.eventId,
      ...(await getInput(s)),
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.other.client.action(api.staffActions.accept, { token: old.token }),
  ).rejects.toThrow("INVITE_REVOKED");
  vi.advanceTimersByTime(10);
  const next = await s.owner.client.action(api.staffActions.invite, {
    eventId: s.eventId,
    role: "mentor",
  });
  await s.other.client.action(api.staffActions.accept, { token: next.token });
  expect(
    (
      await s.other.client.query(api.manage.detail, {
        slug: "nuestro-hackathon",
      })
    )?.role,
  ).toBe("mentor");
});
test("staff permissions cannot change owner, self-escalate or target another event", async () => {
  const s = await setup();
  const invite = await s.owner.client.action(api.staffActions.invite, {
    eventId: s.eventId,
    role: "co_organizer",
  });
  await s.other.client.action(api.staffActions.accept, { token: invite.token });
  const rows = await s.owner.client.query(api.staff.list, {
    eventId: s.eventId,
    paginationOpts,
  });
  const ownerId = rows.page.find((row) => row.member.role === "owner")!.member
      ._id,
    otherId = rows.page.find((row) => row.member.userId === s.other.id)!.member
      ._id;
  const args = {
    eventId: s.eventId,
    memberId: otherId,
    role: "co_organizer" as const,
    extraPermissions: [],
    revokedPermissions: ["event.edit"],
  };
  await expect(
    s.other.client.mutation(api.staff.update, {
      ...args,
      extraPermissions: ["event.delete"],
    }),
  ).rejects.toThrow("PROTECTED_MEMBER");
  await expect(
    s.other.client.mutation(api.staff.revoke, {
      eventId: s.eventId,
      memberId: ownerId,
    }),
  ).rejects.toThrow("PROTECTED_MEMBER");
  await s.owner.client.mutation(api.staff.update, args);
  await expect(
    s.other.client.mutation(api.manage.update, {
      eventId: s.eventId,
      ...(await getInput(s)),
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.other.client.action(api.staffActions.invite, {
      eventId: s.eventId,
      role: "co_organizer",
    }),
  ).rejects.toThrow("PERMISSION_ESCALATION");
  await expect(
    s.owner.client.mutation(api.staff.update, {
      ...args,
      extraPermissions: ["made.up"],
    }),
  ).rejects.toThrow("INVALID_PERMISSIONS");
});
test("pending invite is invalidated if inviter loses staff management", async () => {
  const s = await setup();
  const invite = await s.owner.client.action(api.staffActions.invite, {
    eventId: s.eventId,
    role: "co_organizer",
  });
  await s.other.client.action(api.staffActions.accept, { token: invite.token });
  const issued = await s.other.client.action(api.staffActions.invite, {
    eventId: s.eventId,
    role: "mentor",
  });
  const rows = await s.owner.client.query(api.staff.list, {
    eventId: s.eventId,
    paginationOpts,
  });
  await s.owner.client.mutation(api.staff.revoke, {
    eventId: s.eventId,
    memberId: rows.page.find((row) => row.member.userId === s.other.id)!.member
      ._id,
  });
  await expect(
    s.applicant.client.action(api.staffActions.accept, { token: issued.token }),
  ).rejects.toThrow("FORBIDDEN");
});
test("staff and invite records from another event cannot be mutated via the current event ID", async () => {
  const s = await setup();
  const second = await s.owner.client.mutation(api.manage.create, {
    name: "Segundo evento",
    slug: "segundo",
    type: "hackathon",
    timezone: "UTC",
  });
  const issued = await s.owner.client.action(api.staffActions.invite, {
    eventId: second,
    role: "mentor",
  });
  await s.other.client.action(api.staffActions.accept, { token: issued.token });
  const rows = await s.owner.client.query(api.staff.list, {
    eventId: second,
    paginationOpts,
  });
  const memberId = rows.page.find((row) => row.member.userId === s.other.id)!
    .member._id;
  await expect(
    s.owner.client.mutation(api.staff.revoke, { eventId: s.eventId, memberId }),
  ).rejects.toThrow("NOT_FOUND");
  const pending = await s.owner.client.action(api.staffActions.invite, {
    eventId: second,
    role: "judge",
  });
  await expect(
    s.owner.client.mutation(api.staff.revokeInvite, {
      eventId: s.eventId,
      inviteId: pending.id,
    }),
  ).rejects.toThrow("INVITE_UNAVAILABLE");
  expect(
    (await s.other.client.query(api.manage.mine, { paginationOpts })).page.map(
      (e) => e.id,
    ),
  ).toEqual([second]);
});
test("superadmin can manage any event and its actions are audited", async () => {
  const s = await setup();
  expect(
    (await s.admin.client.query(api.manage.all, { paginationOpts })).page[0].id,
  ).toBe(s.eventId);
  await s.admin.client.mutation(api.manage.update, {
    eventId: s.eventId,
    ...(await getInput(s)),
    name: "Revisión del admin",
  });
  expect(
    (
      await s.admin.client.query(api.manage.audit, {
        eventId: s.eventId,
        paginationOpts,
      })
    ).page[0],
  ).toMatchObject({ actorId: s.admin.id, action: "event.update" });
  await expect(
    s.other.client.query(api.manage.audit, {
      eventId: s.eventId,
      paginationOpts,
    }),
  ).rejects.toThrow("FORBIDDEN");
});
