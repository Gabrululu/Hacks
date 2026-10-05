// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { test, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { SignJWT, importPKCS8 } from "jose";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import {
  DEFAULT_CONSENT,
  DEFAULT_RULES,
  validateAnswers,
  validateFields,
  validateValue,
  type Field,
} from "./lib/formEngine";
import { csvCell, registrationsCsv } from "../src/features/registration/csv";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const fields: Field[] = [
  {
    id: "experience",
    type: "select",
    label: "Experiencia",
    required: true,
    options: [
      { value: "yes", label: "Sí" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "details",
    type: "long_text",
    label: "Cuéntanos más",
    required: true,
    showIf: { fieldId: "experience", equals: "yes" },
  },
  {
    id: "private",
    type: "short_text",
    label: "Dato reservado",
    required: false,
    staffVisibility: "organizers",
  },
];
async function setup(
  admission: "manual" | "capped" | "auto" = "manual",
  capacity?: number,
) {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  async function person(name: string, role: "organizer" | "user" = "user") {
    const data = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        wallet: Keypair.random().publicKey(),
        name,
        email: `${name}@example.com`,
        emailVerifiedAt: Date.now(),
        platformRole: role,
        tokenIdentifier: `test|${name}`,
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
    alice = await person("alice"),
    bob = await person("bob"),
    reviewer = await person("reviewer");
  const eventId = await owner.client.mutation(api.manage.create, {
    name: "Registro real",
    slug: "registro-real",
    type: "hackathon",
    timezone: "UTC",
  });
  await t.run(async (ctx) => {
    const e = (await ctx.db.get(eventId))!;
    await ctx.db.patch(eventId, {
      status: "published",
      registrationOpen: true,
      timeline: {
        ...e.timeline,
        registrationOpensAt: Date.now() - 10000,
        registrationClosesAt: Date.now() + 86400000,
        startsAt: Date.now() - 1000,
      },
      settings: { ...e.settings, admission, capacity },
    });
    await ctx.db.insert("eventStaff", {
      eventId,
      userId: reviewer.id,
      role: "reviewer",
      extraPermissions: ["forms.edit"],
    });
  });
  const formId = await owner.client.mutation(api.forms.save, {
    eventId,
    kind: "registration",
    expectedRevision: 0,
    fields,
    consentText: DEFAULT_CONSENT,
    rulesText: DEFAULT_RULES,
  });
  await owner.client.mutation(api.forms.publish, {
    eventId,
    id: formId,
    expectedRevision: 1,
  });
  const args = {
    eventId,
    formId,
    answers: { experience: "no", private: "Secreto" },
    rulesAccepted: true,
    consentAccepted: true,
    emailOptOut: false,
  };
  return { t, owner, alice, bob, reviewer, eventId, formId, args, person };
}
test("conditional answers enforce required visible fields and discard hidden values", () => {
  validateFields(fields);
  expect(
    validateAnswers(fields, {
      experience: "no",
      details: "Hidden injected value",
    }),
  ).toEqual({ experience: "no" });
  expect(() => validateAnswers(fields, { experience: "yes" })).toThrow(
    "INVALID_ANSWER",
  );
  expect(() =>
    validateAnswers(fields, { experience: "no", invented: "x" }),
  ).toThrow("UNKNOWN_ANSWER");
  expect(() =>
    validateFields([
      { ...fields[1], showIf: { fieldId: "missing", equals: "x" } },
    ]),
  ).toThrow("INVALID_CONDITION");
  expect(() =>
    validateFields([
      {
        id: "abc",
        type: "short_text",
        label: "Pattern",
        required: false,
        validation: { pattern: "^(a+)+$" },
      },
    ]),
  ).toThrow("UNSAFE_PATTERN");
});
test("typed answers validate URLs, dates, numeric limits and Stellar checksums", () => {
  const field = (type: string): Field => ({
    id: "a",
    type,
    label: "A",
    required: true,
  });
  expect(() =>
    validateValue(field("github_url"), "https://example.com/a"),
  ).toThrow();
  expect(() => validateValue(field("url"), "javascript:alert(1)")).toThrow();
  expect(() => validateValue(field("date"), "2026-02-30")).toThrow();
  expect(() =>
    validateValue({ ...field("number"), validation: { min: 0, max: 10 } }, 11),
  ).toThrow();
  const wallet = Keypair.random().publicKey();
  expect(() => validateValue(field("stellar_address"), wallet)).not.toThrow();
  expect(() =>
    validateValue(field("stellar_address"), "G" + "A".repeat(55)),
  ).toThrow();
  const contract = StrKey.encodeContract(Buffer.alloc(32, 1));
  expect(() => validateValue(field("contract_id"), contract)).not.toThrow();
});
test("registration requires authentication, verified profile, active window and both consents", async () => {
  const s = await setup();
  await expect(s.t.mutation(api.registrations.submit, s.args)).rejects.toThrow(
    "UNAUTHENTICATED",
  );
  await expect(
    s.alice.client.mutation(api.registrations.submit, {
      ...s.args,
      consentAccepted: false,
    }),
  ).rejects.toThrow("CONSENT_REQUIRED");
  await expect(
    s.alice.client.mutation(api.registrations.submit, {
      ...s.args,
      rulesAccepted: false,
    }),
  ).rejects.toThrow("CONSENT_REQUIRED");
  await s.t.run((ctx) =>
    ctx.db.patch(s.alice.id, { emailVerifiedAt: undefined }),
  );
  await expect(
    s.alice.client.mutation(api.registrations.submit, s.args),
  ).rejects.toThrow("PROFILE_INCOMPLETE");
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.alice.id, { emailVerifiedAt: Date.now() });
    const e = (await ctx.db.get(s.eventId))!;
    await ctx.db.patch(s.eventId, {
      timeline: { ...e.timeline, registrationClosesAt: Date.now() - 1 },
    });
  });
  await expect(
    s.alice.client.mutation(api.registrations.submit, s.args),
  ).rejects.toThrow("REGISTRATION_CLOSED");
});
test("published forms are immutable and registrations retain original field labels and identity", async () => {
  const s = await setup();
  const id = await s.alice.client.mutation(api.registrations.submit, s.args);
  const changed = fields.map((f) =>
    f.id === "experience" ? { ...f, label: "Nueva etiqueta" } : f,
  );
  const draft = await s.owner.client.mutation(api.forms.save, {
    eventId: s.eventId,
    kind: "registration",
    expectedRevision: 2,
    fields: changed,
    consentText: DEFAULT_CONSENT,
    rulesText: DEFAULT_RULES,
  });
  expect(draft).not.toBe(s.formId);
  expect(
    (await s.t.query(api.forms.registration, { slug: "registro-real" }))?.form
      ?._id,
  ).toBe(s.formId);
  await s.owner.client.mutation(api.forms.publish, {
    eventId: s.eventId,
    id: draft,
    expectedRevision: 3,
  });
  await expect(
    s.bob.client.mutation(api.registrations.submit, s.args),
  ).rejects.toThrow("FORM_CHANGED");
  await s.t.run((ctx) =>
    ctx.db.patch(s.alice.id, {
      name: "Otro nombre",
      email: "changed@example.com",
    }),
  );
  const r = await s.alice.client.query(api.registrations.mine, {
    slug: "registro-real",
  });
  expect(r?.id).toBe(id);
  expect(r?.name).toBe("alice");
  expect(r?.email).toBe("alice@example.com");
  expect(r?.fields[0].label).toBe("Experiencia");
  expect(r?.formVersion).toBe(1);
  await expect(
    s.alice.client.mutation(api.registrations.submit, s.args),
  ).rejects.toThrow("ALREADY_REGISTERED");
  expect(
    await s.bob.client.query(api.registrations.mine, { slug: "registro-real" }),
  ).toBeNull();
});
test("stale edits and reuse of removed identifiers are refused", async () => {
  const s = await setup();
  await expect(
    s.owner.client.mutation(api.forms.save, {
      eventId: s.eventId,
      kind: "registration",
      expectedRevision: 0,
      fields,
      consentText: DEFAULT_CONSENT,
      rulesText: DEFAULT_RULES,
    }),
  ).rejects.toThrow("FORM_CONFLICT");
  await s.owner.client.mutation(api.forms.save, {
    eventId: s.eventId,
    kind: "registration",
    expectedRevision: 2,
    fields: fields.slice(0, 2),
    consentText: DEFAULT_CONSENT,
    rulesText: DEFAULT_RULES,
  });
  await expect(
    s.owner.client.mutation(api.forms.save, {
      eventId: s.eventId,
      kind: "registration",
      expectedRevision: 3,
      fields,
      consentText: DEFAULT_CONSENT,
      rulesText: DEFAULT_RULES,
    }),
  ).rejects.toThrow("RETIRED_FIELD_ID");
});
test("reviewers cannot see organizer-only fields even with an extra forms permission", async () => {
  const s = await setup();
  await s.alice.client.mutation(api.registrations.submit, s.args);
  const q = {
    eventId: s.eventId,
    paginationOpts: { numItems: 20, cursor: null },
  };
  for (const fn of [api.registrations.list, api.registrations.exportPage]) {
    const r = await s.reviewer.client.query(fn, q);
    expect(r.page[0].answers).toEqual({ experience: "no" });
    expect(r.page[0].fields.some((f) => f.id === "private")).toBe(false);
    await expect(s.bob.client.query(fn, q)).rejects.toThrow("FORBIDDEN");
  }
  const r = await s.owner.client.query(api.registrations.exportPage, q);
  expect(r.page[0].answers.private).toBe("Secreto");
  expect(
    await s.t.query(api.forms.registration, { slug: "registro-real" }),
  ).not.toHaveProperty("registrations");
});
test("capped admission never exceeds capacity and withdrawing promotes the earliest waiter", async () => {
  const s = await setup("capped", 1);
  const a = await s.alice.client.mutation(api.registrations.submit, s.args),
    b = await s.bob.client.mutation(api.registrations.submit, s.args);
  expect(
    (
      await s.alice.client.query(api.registrations.mine, {
        slug: "registro-real",
      })
    )?.status,
  ).toBe("approved");
  expect(
    (
      await s.bob.client.query(api.registrations.mine, {
        slug: "registro-real",
      })
    )?.status,
  ).toBe("waitlisted");
  await expect(
    s.owner.client.mutation(api.registrations.review, {
      eventId: s.eventId,
      ids: [b],
      status: "approved",
    }),
  ).rejects.toThrow("CAPACITY_REACHED");
  await expect(
    s.bob.client.mutation(api.registrations.withdraw, { id: a }),
  ).rejects.toThrow("NOT_FOUND");
  await s.alice.client.mutation(api.registrations.withdraw, { id: a });
  expect(
    (
      await s.bob.client.query(api.registrations.mine, {
        slug: "registro-real",
      })
    )?.status,
  ).toBe("approved");
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("registrationTotals")
        .withIndex("by_eventId", (q) => q.eq("eventId", s.eventId))
        .unique(),
    ),
  ).toMatchObject({ admitted: 1 });
  await expect(
    s.owner.client.mutation(api.registrations.review, {
      eventId: s.eventId,
      ids: [a],
      status: "approved",
    }),
  ).rejects.toThrow("INVALID_TRANSITION");
});
test("manual bulk review is atomic, checks event boundaries and preserves counters", async () => {
  const s = await setup("manual", 1);
  const a = await s.alice.client.mutation(api.registrations.submit, s.args),
    b = await s.bob.client.mutation(api.registrations.submit, s.args);
  await expect(
    s.owner.client.mutation(api.registrations.review, {
      eventId: s.eventId,
      ids: [a, b],
      status: "approved",
    }),
  ).rejects.toThrow("CAPACITY_REACHED");
  expect(
    (
      await s.alice.client.query(api.registrations.mine, {
        slug: "registro-real",
      })
    )?.status,
  ).toBe("pending");
  await expect(
    s.alice.client.mutation(api.registrations.review, {
      eventId: s.eventId,
      ids: [a],
      status: "approved",
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.reviewer.client.mutation(api.registrations.review, {
    eventId: s.eventId,
    ids: [a],
    status: "approved",
  });
  await s.reviewer.client.mutation(api.registrations.review, {
    eventId: s.eventId,
    ids: [a],
    status: "approved",
  });
  await s.reviewer.client.mutation(api.registrations.review, {
    eventId: s.eventId,
    ids: [a],
    status: "rejected",
  });
  await s.owner.client.mutation(api.registrations.review, {
    eventId: s.eventId,
    ids: [b],
    status: "approved",
  });
  expect(
    (
      await s.bob.client.query(api.registrations.mine, {
        slug: "registro-real",
      })
    )?.status,
  ).toBe("approved");
  const other = await s.owner.client.mutation(api.manage.create, {
    name: "Otro evento",
    slug: "otro-evento",
    type: "hackathon",
    timezone: "UTC",
  });
  await s.t.run((ctx) => ctx.db.patch(other, { status: "published" }));
  await expect(
    s.owner.client.mutation(api.registrations.review, {
      eventId: other,
      ids: [a],
      status: "approved",
    }),
  ).rejects.toThrow("NOT_FOUND");
});
test("signed Hacker Pass checks identity, audience, event, approval and idempotent check-in", async () => {
  const s = await setup("auto");
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKey = keys.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  vi.stubEnv("AUTH_PRIVATE_KEY", privateKey);
  vi.stubEnv("AUTH_ISSUER", "http://127.0.0.1:3211");
  await s.alice.client.mutation(api.registrations.submit, s.args);
  await expect(
    s.bob.client.action(api.hackerPass.issue, { slug: "registro-real" }),
  ).rejects.toThrow();
  const pass = await s.alice.client.action(api.hackerPass.issue, {
    slug: "registro-real",
  });
  await expect(
    s.alice.client.action(api.hackerPass.checkIn, {
      eventId: s.eventId,
      token: pass.token,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.reviewer.client.action(api.hackerPass.checkIn, {
      eventId: s.eventId,
      token: pass.token + "invalid",
    }),
  ).rejects.toThrow("INVALID_PASS");
  const wrongAudience = await new SignJWT({
    eventId: s.eventId,
    registrationId: "wrong",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("http://127.0.0.1:3211")
    .setAudience("hacks")
    .setExpirationTime("1h")
    .sign(await importPKCS8(privateKey, "RS256"));
  await expect(
    s.reviewer.client.action(api.hackerPass.checkIn, {
      eventId: s.eventId,
      token: wrongAudience,
    }),
  ).rejects.toThrow("INVALID_PASS");
  expect(
    await s.reviewer.client.action(api.hackerPass.checkIn, {
      eventId: s.eventId,
      token: pass.token,
    }),
  ).toBe("checked_in");
  expect(
    await s.reviewer.client.action(api.hackerPass.checkIn, {
      eventId: s.eventId,
      token: pass.token,
    }),
  ).toBe("already_checked_in");
  expect(
    (
      await s.alice.client.query(api.registrations.mine, {
        slug: "registro-real",
      })
    )?.checkedInAt,
  ).not.toBeNull();
});
test("revoked approval invalidates an issued QR and check-in cannot open early", async () => {
  const s = await setup("auto"),
    keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  vi.stubEnv(
    "AUTH_PRIVATE_KEY",
    keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  );
  vi.stubEnv("AUTH_ISSUER", "http://127.0.0.1:3211");
  const id = await s.alice.client.mutation(api.registrations.submit, s.args),
    pass = await s.alice.client.action(api.hackerPass.issue, {
      slug: "registro-real",
    });
  await s.owner.client.mutation(api.registrations.review, {
    eventId: s.eventId,
    ids: [id],
    status: "rejected",
  });
  await expect(
    s.reviewer.client.action(api.hackerPass.checkIn, {
      eventId: s.eventId,
      token: pass.token,
    }),
  ).rejects.toThrow("NOT_APPROVED");
  await s.owner.client.mutation(api.registrations.review, {
    eventId: s.eventId,
    ids: [id],
    status: "approved",
  });
  await s.t.run(async (ctx) => {
    const e = (await ctx.db.get(s.eventId))!;
    await ctx.db.patch(s.eventId, {
      timeline: { ...e.timeline, startsAt: Date.now() + 10000 },
    });
  });
  await expect(
    s.reviewer.client.action(api.hackerPass.checkIn, {
      eventId: s.eventId,
      token: pass.token,
    }),
  ).rejects.toThrow("EVENT_NOT_STARTED");
});
test("local status emails are delivered once without exposing other participants' mail", async () => {
  const s = await setup();
  vi.stubEnv("EMAIL_DELIVERY_MODE", "development");
  vi.stubEnv("AUTH_ISSUER", "http://127.0.0.1:3211");
  await s.alice.client.mutation(api.registrations.submit, s.args);
  const n = await s.t.run((ctx) =>
    ctx.db.query("registrationNotifications").first(),
  );
  await s.t.action(internal.registrationEmails.deliver, { id: n!._id });
  await s.t.action(internal.registrationEmails.deliver, { id: n!._id });
  expect((await s.t.run((ctx) => ctx.db.get(n!._id)))?.delivery).toBe(
    "development",
  );
  expect(
    (
      await s.alice.client.query(api.registrations.notifications, {
        slug: "registro-real",
      })
    )[0]?.subject,
  ).toContain("en revisión");
  expect(
    await s.bob.client.query(api.registrations.notifications, {
      slug: "registro-real",
    }),
  ).toEqual([]);
});
test("CSV protects formula cells and preserves labels from historical versions", () => {
  expect(csvCell('=IMPORTXML("x")')).toBe('"\'=IMPORTXML(""x"")"');
  expect(csvCell("\t=1")).toContain("'");
  expect(csvCell("Hello, world")).toBe('"Hello, world"');
  const row = {
    id: "id" as Id<"registrations">,
    eventId: "event" as Id<"events">,
    status: "approved",
    name: "=1+1",
    email: "a@example.com",
    wallet: "G…",
    formVersion: 1,
    fields: [fields[0]],
    answers: { experience: "no" },
    consentText: "",
    rulesText: "",
    consentAt: 0,
    checkedInAt: null,
  } as Parameters<typeof registrationsCsv>[0][number];
  const next = {
    ...row,
    formVersion: 2,
    fields: [{ ...fields[0], label: "Nueva etiqueta" }],
    answers: { experience: "yes" },
  };
  const csv = registrationsCsv([row, next]);
  expect(csv).toContain('"Experiencia","Nueva etiqueta"');
  expect(csv).toContain('"no",""');
  expect(csv).toContain('"","yes"');
  expect(csv).toContain("'=1+1");
});

test("registration attachments are owned, scoped to their field and private at download", async () => {
  const s = await setup();
  const fileFields: Field[] = [
    ...fields,
    {
      id: "attachment",
      type: "file",
      label: "Archivo privado",
      required: true,
      staffVisibility: "organizers",
      validation: { accept: "text/plain,application/pdf", maxFileMB: 1 },
    },
  ];
  const formId = await s.owner.client.mutation(api.forms.save, {
    eventId: s.eventId,
    kind: "registration",
    expectedRevision: 2,
    fields: fileFields,
    consentText: DEFAULT_CONSENT,
    rulesText: DEFAULT_RULES,
  });
  await s.owner.client.mutation(api.forms.publish, {
    eventId: s.eventId,
    id: formId,
    expectedRevision: 3,
  });
  const path = `/registration-upload?eventId=${s.eventId}&formId=${formId}&fieldId=attachment`;
  expect(
    (
      await s.t.fetch(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "private",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await s.alice.client.fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: "not a pdf",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await s.alice.client.fetch(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "a".repeat(1024 * 1024 + 1),
      })
    ).status,
  ).toBe(400);
  const response = await s.alice.client.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "X-File-Name": "cv.txt" },
    body: "Private résumé",
  });
  expect(response.status).toBe(200);
  const { fileId } = (await response.json()) as { fileId: string };
  await expect(
    s.bob.client.mutation(api.registrations.submit, {
      ...s.args,
      formId,
      answers: { experience: "no", attachment: fileId },
    }),
  ).rejects.toThrow("INVALID_FILE");
  const id = await s.alice.client.mutation(api.registrations.submit, {
      ...s.args,
      formId,
      answers: { experience: "no", attachment: fileId },
    }),
    download = `/registration-file?registrationId=${id}&fieldId=attachment`;
  expect((await s.t.fetch(download)).status).toBe(404);
  expect((await s.bob.client.fetch(download)).status).toBe(404);
  expect((await s.reviewer.client.fetch(download)).status).toBe(404);
  expect(await (await s.owner.client.fetch(download)).text()).toBe(
    "Private résumé",
  );
  expect(await (await s.alice.client.fetch(download)).text()).toBe(
    "Private résumé",
  );
  expect(
    (
      await s.alice.client.fetch(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "another",
      })
    ).status,
  ).toBe(403);
});

test("check-in rejects a QR from a different event, expired QR and revoked staff sessions", async () => {
  const s = await setup("auto"),
    keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = keys.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  vi.stubEnv("AUTH_PRIVATE_KEY", key);
  vi.stubEnv("AUTH_ISSUER", "http://127.0.0.1:3211");
  await s.alice.client.mutation(api.registrations.submit, s.args);
  const pass = await s.alice.client.action(api.hackerPass.issue, {
    slug: "registro-real",
  });
  const other = await s.owner.client.mutation(api.manage.create, {
    name: "Otro evento",
    slug: "otro-evento",
    type: "hackathon",
    timezone: "UTC",
  });
  await expect(
    s.owner.client.action(api.hackerPass.checkIn, {
      eventId: other,
      token: pass.token,
    }),
  ).rejects.toThrow("INVALID_PASS");
  const expired = await new SignJWT({
    eventId: s.eventId,
    registrationId: "irrelevant",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("http://127.0.0.1:3211")
    .setAudience("hacks-checkin")
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
    .sign(await importPKCS8(key, "RS256"));
  await expect(
    s.reviewer.client.action(api.hackerPass.checkIn, {
      eventId: s.eventId,
      token: expired,
    }),
  ).rejects.toThrow("INVALID_PASS");
  await s.t.run((ctx) =>
    ctx.db.patch(s.reviewer.sessionId, { revokedAt: Date.now() }),
  );
  await expect(
    s.reviewer.client.action(api.hackerPass.checkIn, {
      eventId: s.eventId,
      token: pass.token,
    }),
  ).rejects.toThrow("SESSION_EXPIRED");
});

test("large text forms and answers enforce their byte budget", () => {
  const large = Array.from({ length: 40 }, (_, i): Field => ({
    id: `q-${i}`,
    type: "long_text",
    label: "Pregunta",
    required: false,
    help: "界".repeat(1000),
  }));
  expect(() => validateFields(large)).toThrow("FORM_TOO_LARGE");
  const fields = Array.from({ length: 4 }, (_, i): Field => ({
    id: `q-${i}`,
    type: "long_text",
    label: "Pregunta",
    required: false,
  }));
  expect(() =>
    validateAnswers(
      fields,
      Object.fromEntries(fields.map((f) => [f.id, "界".repeat(9000)])),
    ),
  ).toThrow("ANSWERS_TOO_LARGE");
});

test("export is paginated, filtered and complete while bounding each request", async () => {
  const s = await setup("auto");
  for (let i = 0; i < 30; i++) {
    const person = await s.person(`participant-${i}`);
    await person.client.mutation(api.registrations.submit, s.args);
  }
  const first = await s.reviewer.client.query(api.registrations.exportPage, {
    eventId: s.eventId,
    status: "approved",
    paginationOpts: { numItems: 1000, cursor: null },
  });
  expect(first.page).toHaveLength(25);
  expect(first.isDone).toBe(false);
  expect(
    first.page.every(
      (r) => r.status === "approved" && !Object.hasOwn(r.answers, "private"),
    ),
  ).toBe(true);
  const last = await s.reviewer.client.query(api.registrations.exportPage, {
    eventId: s.eventId,
    status: "approved",
    paginationOpts: { numItems: 1000, cursor: first.continueCursor },
  });
  expect(last.page).toHaveLength(5);
  expect(last.isDone).toBe(true);
  expect(new Set([...first.page, ...last.page].map((r) => r.id)).size).toBe(30);
  expect(
    (
      await s.owner.client.query(api.registrations.list, {
        eventId: s.eventId,
        status: "pending",
        paginationOpts: { numItems: 1000, cursor: null },
      })
    ).page,
  ).toEqual([]);
});

test("legacy registrations resolve their actual version instead of the current form", async () => {
  const s = await setup();
  const id = await s.alice.client.mutation(api.registrations.submit, s.args);
  await s.t.run((ctx) => ctx.db.patch(id, { fieldSnapshot: undefined }));
  const formId = await s.owner.client.mutation(api.forms.save, {
    eventId: s.eventId,
    kind: "registration",
    expectedRevision: 2,
    fields: fields.map((f) => ({ ...f, label: `Nueva ${f.label}` })),
    consentText: DEFAULT_CONSENT,
    rulesText: DEFAULT_RULES,
  });
  await s.owner.client.mutation(api.forms.publish, {
    eventId: s.eventId,
    id: formId,
    expectedRevision: 3,
  });
  expect(
    (
      await s.alice.client.query(api.registrations.mine, {
        slug: "registro-real",
      })
    )?.fields[0].label,
  ).toBe("Experiencia");
});
