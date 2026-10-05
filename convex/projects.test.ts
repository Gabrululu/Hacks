// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { test, expect, vi, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { DEFAULT_RULES, DEFAULT_CONSENT, type Field } from "./lib/formEngine";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  async function person(name: string, role: "organizer" | "user" = "user") {
    const ids = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
          wallet: Keypair.random().publicKey(),
          name,
          email: `${name}@example.com`,
          emailVerifiedAt: Date.now(),
          platformRole: role,
          tokenIdentifier: `test|${name}`,
        }),
        sessionId = await ctx.db.insert("authSessions", {
          userId: id,
          network: "testnet",
          tokenHash: name,
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
  const owner = await person("owner", "organizer"),
    alice = await person("alice"),
    bob = await person("bob"),
    outsider = await person("outsider"),
    reviewer = await person("reviewer"),
    mentor = await person("mentor");
  const eventId = await owner.client.mutation(api.manage.create, {
    name: "Proyectos reales",
    slug: "proyectos-reales",
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
        registrationClosesAt: Date.now() + 60000,
        startsAt: Date.now() - 1000,
        submissionOpensAt: Date.now() - 1000,
        submissionClosesAt: Date.now() + 3600000,
      },
      settings: {
        ...e.settings,
        teamSizeMin: 1,
        teamSizeMax: 2,
        requiredCheckpoints: 0,
        admission: "auto",
      },
    });
    for (const [p, role] of [
      [reviewer, "reviewer"],
      [mentor, "mentor"],
    ] as const)
      await ctx.db.insert("eventStaff", {
        eventId,
        userId: p.id,
        role,
        extraPermissions: [],
      });
  });
  const formId = await owner.client.mutation(api.forms.save, {
    eventId,
    kind: "registration",
    expectedRevision: 0,
    fields: [],
    rulesText: DEFAULT_RULES,
    consentText: DEFAULT_CONSENT,
  });
  await owner.client.mutation(api.forms.publish, {
    eventId,
    id: formId,
    expectedRevision: 1,
  });
  for (const p of [alice, bob])
    await p.client.mutation(api.registrations.submit, {
      eventId,
      formId,
      answers: {},
      rulesAccepted: true,
      consentAccepted: true,
      emailOptOut: false,
    });
  const teamId = await alice.client.mutation(api.teams.create, {
    eventId,
    name: "Equipo Alice",
    description: "",
    lookingForMembers: true,
  });
  const input = {
    teamId,
    expectedRevision: 0,
    title: "Puente Stellar",
    summary: "Un proyecto de remesas sobre Stellar para la comunidad.",
    trackIds: [],
    imageIds: [],
    answers: {},
  };
  return {
    t,
    owner,
    alice,
    bob,
    outsider,
    reviewer,
    mentor,
    eventId,
    teamId,
    input,
    person,
  };
}
test("only approved participants can create teams or read the finder", async () => {
  const s = await setup();
  await expect(
    s.outsider.client.mutation(api.teams.create, {
      eventId: s.eventId,
      name: "Otro equipo",
      description: "",
      lookingForMembers: true,
    }),
  ).rejects.toThrow("REGISTRATION_NOT_APPROVED");
  await expect(
    s.outsider.client.query(api.teams.find, { eventId: s.eventId, search: "" }),
  ).rejects.toThrow("REGISTRATION_NOT_APPROVED");
  await expect(
    s.t.query(api.teams.mine, { eventId: s.eventId }),
  ).rejects.toThrow();
  await expect(
    s.alice.client.mutation(api.teams.create, {
      eventId: s.eventId,
      name: "Duplicado",
      description: "",
      lookingForMembers: true,
    }),
  ).rejects.toThrow("ALREADY_IN_TEAM");
});
test("join codes, membership uniqueness, capacity and leadership are enforced", async () => {
  const s = await setup();
  const mine = (await s.alice.client.query(api.teams.mine, {
    eventId: s.eventId,
  }))!;
  await s.bob.client.mutation(api.teams.join, {
    eventId: s.eventId,
    code: mine.team.joinCode.toLowerCase(),
  });
  await expect(
    s.bob.client.mutation(api.teams.update, {
      teamId: s.teamId,
      name: "Robado",
      description: "",
      lookingForMembers: false,
    }),
  ).rejects.toThrow("TEAM_LEADER_REQUIRED");
  await expect(
    s.bob.client.mutation(api.teams.join, {
      eventId: s.eventId,
      code: mine.team.joinCode,
    }),
  ).rejects.toThrow("ALREADY_IN_TEAM");
  const members = (await s.alice.client.query(api.teams.mine, {
    eventId: s.eventId,
  }))!.members;
  await expect(
    s.alice.client.mutation(api.teams.removeMember, {
      teamId: s.teamId,
      memberId: members.find((m) => m.userId === s.alice.id)!.id,
    }),
  ).rejects.toThrow("TRANSFER_LEADERSHIP_FIRST");
  await s.alice.client.mutation(api.teams.transfer, {
    teamId: s.teamId,
    memberId: members.find((m) => m.userId === s.bob.id)!.id,
  });
  await s.alice.client.mutation(api.teams.removeMember, {
    teamId: s.teamId,
    memberId: members.find((m) => m.userId === s.alice.id)!.id,
  });
  expect(
    (await s.bob.client.query(api.teams.mine, { eventId: s.eventId }))!.team
      .leaderId,
  ).toBe(s.bob.id);
  expect(
    await s.alice.client.query(api.teams.mine, { eventId: s.eventId }),
  ).toBeNull();
});
test("other teams cannot view, save or submit a project's draft", async () => {
  const s = await setup();
  const id = await s.alice.client.mutation(api.projects.save, s.input);
  await expect(
    s.bob.client.query(api.projects.workspace, { teamId: s.teamId }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.bob.client.mutation(api.projects.save, s.input),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.bob.client.mutation(api.projects.submit, { id, expectedRevision: 1 }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.mentor.client.mutation(api.projects.review, {
      eventId: s.eventId,
      id,
      status: "admitted",
      reason: "",
      expectedRevision: 1,
    }),
  ).rejects.toThrow("FORBIDDEN");
});
test("draft saving does not submit and revision conflicts prevent overwriting", async () => {
  const s = await setup();
  const id = await s.alice.client.mutation(api.projects.save, {
    ...s.input,
    title: "",
    summary: "",
  });
  expect(
    (await s.alice.client.query(api.projects.workspace, { teamId: s.teamId }))
      .project?.status,
  ).toBe("draft");
  await expect(
    s.alice.client.mutation(api.projects.submit, { id, expectedRevision: 1 }),
  ).rejects.toThrow("INVALID_PROJECT");
  await expect(
    s.alice.client.mutation(api.projects.save, s.input),
  ).rejects.toThrow("PROJECT_CONFLICT");
  expect(
    (
      await s.alice.client.query(api.projects.history, {
        teamId: s.teamId,
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page,
  ).toHaveLength(0);
});
test("deadline, minimum team size and track event scope are enforced on the server", async () => {
  const s = await setup();
  const id = await s.alice.client.mutation(api.projects.save, s.input);
  await s.t.run(async (ctx) => {
    const e = (await ctx.db.get(s.eventId))!;
    await ctx.db.patch(s.eventId, {
      settings: { ...e.settings, teamSizeMin: 2 },
    });
  });
  await expect(
    s.alice.client.mutation(api.projects.submit, { id, expectedRevision: 1 }),
  ).rejects.toThrow("TEAM_SIZE_INVALID");
  vi.advanceTimersByTime(3600000);
  await expect(
    s.alice.client.mutation(api.projects.save, {
      ...s.input,
      expectedRevision: 1,
    }),
  ).rejects.toThrow("SUBMISSION_CLOSED");
  await expect(
    s.alice.client.mutation(api.projects.submit, { id, expectedRevision: 1 }),
  ).rejects.toThrow("SUBMISSION_CLOSED");
});
test("published submission fields are frozen, required at final delivery, and hidden from reviewers", async () => {
  const s = await setup();
  const fields: Field[] = [
    {
      id: "private",
      label: "Privado",
      type: "short_text",
      required: true,
      staffVisibility: "organizers",
    },
  ];
  const f = await s.owner.client.mutation(api.forms.save, {
    eventId: s.eventId,
    kind: "submission",
    fields,
    expectedRevision: 0,
    rulesText: DEFAULT_RULES,
    consentText: DEFAULT_CONSENT,
  });
  await s.owner.client.mutation(api.forms.publish, {
    eventId: s.eventId,
    id: f,
    expectedRevision: 1,
  });
  const id = await s.alice.client.mutation(api.projects.save, s.input);
  await expect(
    s.alice.client.mutation(api.projects.submit, { id, expectedRevision: 1 }),
  ).rejects.toThrow("INVALID_ANSWER");
  await s.alice.client.mutation(api.projects.save, {
    ...s.input,
    expectedRevision: 1,
    answers: { private: "Secreto" },
  });
  await s.alice.client.mutation(api.projects.submit, {
    id,
    expectedRevision: 2,
  });
  const page = await s.reviewer.client.query(api.projects.list, {
    eventId: s.eventId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(page.page[0].answers).toEqual({});
  expect(page.page[0].fields).toEqual([]);
  const own = await s.owner.client.query(api.projects.list, {
    eventId: s.eventId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(own.page[0].answers.private).toBe("Secreto");
});
test("review decisions require reasons, reject stale revisions, and snapshots survive resubmission", async () => {
  const s = await setup();
  const id = await s.alice.client.mutation(api.projects.save, s.input);
  await s.alice.client.mutation(api.projects.submit, {
    id,
    expectedRevision: 1,
  });
  await expect(
    s.reviewer.client.mutation(api.projects.review, {
      eventId: s.eventId,
      id,
      status: "disqualified",
      reason: "",
      expectedRevision: 2,
    }),
  ).rejects.toThrow("REVIEW_REASON_REQUIRED");
  await s.reviewer.client.mutation(api.projects.review, {
    eventId: s.eventId,
    id,
    status: "disqualified",
    reason: "Falta documentación",
    expectedRevision: 2,
  });
  await expect(
    s.reviewer.client.mutation(api.projects.review, {
      eventId: s.eventId,
      id,
      status: "admitted",
      reason: "",
      expectedRevision: 2,
    }),
  ).rejects.toThrow("PROJECT_CONFLICT");
  await s.alice.client.mutation(api.projects.save, {
    ...s.input,
    expectedRevision: 3,
    title: "Nuevo título",
  });
  await s.alice.client.mutation(api.projects.submit, {
    id,
    expectedRevision: 4,
  });
  const h = await s.alice.client.query(api.projects.history, {
    teamId: s.teamId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(h.page.map((r) => r.title)).toEqual([
    "Nuevo título",
    "Puente Stellar",
  ]);
  expect(h.page.map((r) => r.version)).toEqual([2, 1]);
  expect(
    (await s.alice.client.query(api.projects.workspace, { teamId: s.teamId }))
      .project?.reviewReason,
  ).toBeNull();
  await s.reviewer.client.mutation(api.projects.review, {
    eventId: s.eventId,
    id,
    status: "admitted",
    reason: "",
    expectedRevision: 5,
  });
});
test("final delivery permanently locks membership and prevents withdrawal even when editing again", async () => {
  const s = await setup();
  const mine = (await s.alice.client.query(api.teams.mine, {
      eventId: s.eventId,
    }))!,
    id = await s.alice.client.mutation(api.projects.save, s.input);
  await s.alice.client.mutation(api.projects.submit, {
    id,
    expectedRevision: 1,
  });
  await s.alice.client.mutation(api.projects.save, {
    ...s.input,
    expectedRevision: 2,
  });
  await expect(
    s.bob.client.mutation(api.teams.join, {
      eventId: s.eventId,
      code: mine.team.joinCode,
    }),
  ).rejects.toThrow("PROJECT_TEAM_LOCKED");
  await expect(
    s.alice.client.mutation(api.teams.removeMember, {
      teamId: s.teamId,
      memberId: mine.members[0].id,
    }),
  ).rejects.toThrow("PROJECT_TEAM_LOCKED");
  const r = (await s.alice.client.query(api.registrations.mine, {
    slug: "proyectos-reales",
  }))!;
  await expect(
    s.alice.client.mutation(api.registrations.withdraw, { id: r.id }),
  ).rejects.toThrow("PROJECT_TEAM_LOCKED");
});
test("accepted checkpoints gate delivery and cannot be changed after final delivery", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const e = (await ctx.db.get(s.eventId))!;
    await ctx.db.patch(s.eventId, {
      settings: { ...e.settings, requiredCheckpoints: 1 },
    });
  });
  const cp = await s.owner.client.mutation(api.checkpoints.save, {
    eventId: s.eventId,
    title: "Avance uno",
    description: "",
    dueAt: Date.now() + 60000,
    order: 0,
    expectedRevision: 0,
  });
  const id = await s.alice.client.mutation(api.projects.save, s.input);
  await expect(
    s.alice.client.mutation(api.projects.submit, { id, expectedRevision: 1 }),
  ).rejects.toThrow("CHECKPOINT_GATE");
  const response = await s.alice.client.mutation(api.checkpoints.submit, {
    teamId: s.teamId,
    checkpointId: cp,
    answers: { progress: "Avanzamos" },
    expectedRevision: 0,
  });
  await expect(
    s.owner.client.mutation(api.checkpoints.remove, {
      eventId: s.eventId,
      id: cp,
    }),
  ).rejects.toThrow("CHECKPOINT_HAS_RESPONSES");
  await s.reviewer.client.mutation(api.checkpoints.review, {
    eventId: s.eventId,
    id: response,
    status: "accepted",
    reason: "",
    expectedRevision: 1,
  });
  await s.alice.client.mutation(api.projects.submit, {
    id,
    expectedRevision: 1,
  });
  await expect(
    s.alice.client.mutation(api.checkpoints.submit, {
      teamId: s.teamId,
      checkpointId: cp,
      answers: { progress: "Otro" },
      expectedRevision: 2,
    }),
  ).rejects.toThrow("PROJECT_TEAM_LOCKED");
  await expect(
    s.reviewer.client.mutation(api.checkpoints.review, {
      eventId: s.eventId,
      id: response,
      status: "rejected",
      reason: "Cambio",
      expectedRevision: 2,
    }),
  ).rejects.toThrow("CHECKPOINT_REVIEW_LOCKED");
});
test("merge needs both leaders, moves members and preserves accepted checkpoints", async () => {
  const s = await setup();
  const other = await s.bob.client.mutation(api.teams.create, {
    eventId: s.eventId,
    name: "Equipo Bob",
    description: "",
    lookingForMembers: true,
  });
  const cp = await s.owner.client.mutation(api.checkpoints.save, {
    eventId: s.eventId,
    title: "Avance",
    description: "",
    dueAt: Date.now() + 60000,
    order: 0,
    expectedRevision: 0,
  });
  const response = await s.alice.client.mutation(api.checkpoints.submit, {
    teamId: s.teamId,
    checkpointId: cp,
    answers: { progress: "Ya funciona" },
    expectedRevision: 0,
  });
  await s.reviewer.client.mutation(api.checkpoints.review, {
    eventId: s.eventId,
    id: response,
    status: "accepted",
    reason: "",
    expectedRevision: 1,
  });
  const request = await s.alice.client.mutation(api.teams.requestMerge, {
    sourceId: s.teamId,
    targetId: other,
  });
  await expect(
    s.alice.client.mutation(api.teams.resolveMerge, {
      id: request,
      accept: true,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await s.bob.client.mutation(api.teams.resolveMerge, {
    id: request,
    accept: true,
  });
  expect(
    (await s.alice.client.query(api.teams.mine, { eventId: s.eventId }))!.team
      ._id,
  ).toBe(other);
  expect(
    (await s.bob.client.query(api.checkpoints.mine, { teamId: other }))[0]
      .response?.status,
  ).toBe("accepted");
  expect(
    (await s.bob.client.query(api.teams.mine, { eventId: s.eventId }))!.members,
  ).toHaveLength(2);
  await expect(
    s.alice.client.query(api.projects.workspace, { teamId: s.teamId }),
  ).rejects.toThrow("TEAM_NOT_ACTIVE");
});
test("checkpoint and review deadlines apply and archived events cannot be reviewed", async () => {
  const s = await setup();
  const cp = await s.owner.client.mutation(api.checkpoints.save, {
    eventId: s.eventId,
    title: "Avance",
    description: "",
    dueAt: Date.now() + 1000,
    order: 0,
    expectedRevision: 0,
  });
  const response = await s.alice.client.mutation(api.checkpoints.submit, {
    teamId: s.teamId,
    checkpointId: cp,
    answers: { progress: "Avance" },
    expectedRevision: 0,
  });
  vi.advanceTimersByTime(1000);
  await expect(
    s.alice.client.mutation(api.checkpoints.submit, {
      teamId: s.teamId,
      checkpointId: cp,
      answers: { progress: "Avance" },
      expectedRevision: 1,
    }),
  ).rejects.toThrow("CHECKPOINT_CLOSED");
  await s.t.run((ctx) => ctx.db.patch(s.eventId, { status: "archived" }));
  await expect(
    s.reviewer.client.mutation(api.checkpoints.review, {
      eventId: s.eventId,
      id: response,
      status: "accepted",
      reason: "",
      expectedRevision: 1,
    }),
  ).rejects.toThrow("REVIEW_CLOSED");
});
test("private project files enforce ownership, field visibility, and historical scope", async () => {
  const s = await setup();
  const f = await s.owner.client.mutation(api.forms.save, {
    eventId: s.eventId,
    kind: "submission",
    fields: [
      {
        id: "file",
        label: "Privado",
        type: "file",
        required: true,
        staffVisibility: "organizers",
        validation: { accept: "text/plain", maxFileMB: 1 },
      },
    ],
    expectedRevision: 0,
    rulesText: DEFAULT_RULES,
    consentText: DEFAULT_CONSENT,
  });
  await s.owner.client.mutation(api.forms.publish, {
    eventId: s.eventId,
    id: f,
    expectedRevision: 1,
  });
  const fileId = await s.t.run((ctx) =>
    ctx.storage.store(new Blob(["Privado"], { type: "text/plain" })),
  );
  await s.alice.client.mutation(internal.projectFiles.registerUpload, {
    teamId: s.teamId,
    kind: "submission",
    formId: f,
    fieldId: "file",
    fileId,
    name: "privado.txt",
    contentType: "text/plain",
  });
  const id = await s.alice.client.mutation(api.projects.save, {
    ...s.input,
    answers: { file: fileId },
  });
  await s.alice.client.mutation(api.projects.submit, {
    id,
    expectedRevision: 1,
  });
  expect(
    await s.bob.client.query(internal.projectFiles.download, {
      submissionId: id,
      fieldId: "file",
    }),
  ).toBeNull();
  expect(
    await s.reviewer.client.query(internal.projectFiles.download, {
      submissionId: id,
      fieldId: "file",
    }),
  ).toBeNull();
  expect(
    (
      await s.owner.client.query(internal.projectFiles.download, {
        submissionId: id,
        fieldId: "file",
      })
    )?.fileId,
  ).toBe(fileId);
  const h = await s.alice.client.query(api.projects.history, {
    teamId: s.teamId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(
    (
      await s.alice.client.query(internal.projectFiles.download, {
        versionId: h.page[0].id,
        fieldId: "file",
      })
    )?.fileId,
  ).toBe(fileId);
  await expect(
    s.bob.client.mutation(internal.projectFiles.registerUpload, {
      teamId: s.teamId,
      kind: "submission",
      formId: f,
      fieldId: "file",
      fileId,
      name: "x.txt",
      contentType: "text/plain",
    }),
  ).rejects.toThrow("FORBIDDEN");
});
test("team capacity and merges enforce the event maximum", async () => {
  const s = await setup();
  const mine = (await s.alice.client.query(api.teams.mine, {
    eventId: s.eventId,
  }))!;
  await s.t.run(async (ctx) => {
    const e = (await ctx.db.get(s.eventId))!;
    await ctx.db.patch(s.eventId, {
      settings: { ...e.settings, teamSizeMax: 1 },
    });
  });
  await expect(
    s.bob.client.mutation(api.teams.join, {
      eventId: s.eventId,
      code: mine.team.joinCode,
    }),
  ).rejects.toThrow("TEAM_FULL");
  const target = await s.bob.client.mutation(api.teams.create, {
    eventId: s.eventId,
    name: "Otro equipo",
    description: "",
    lookingForMembers: true,
  });
  const id = await s.alice.client.mutation(api.teams.requestMerge, {
    sourceId: s.teamId,
    targetId: target,
  });
  await expect(
    s.bob.client.mutation(api.teams.resolveMerge, { id, accept: true }),
  ).rejects.toThrow("TEAM_FULL");
  expect(
    (await s.alice.client.query(api.teams.mine, { eventId: s.eventId }))!.team
      ._id,
  ).toBe(s.teamId);
});
test("cross-event track and checkpoint identifiers are refused", async () => {
  const s = await setup();
  const other = await s.owner.client.mutation(api.manage.create, {
    name: "Otro evento",
    slug: "otro-evento",
    type: "hackathon",
    timezone: "UTC",
  });
  const trackId = await s.t.run((ctx) =>
    ctx.db.insert("tracks", { eventId: other, name: "Otro track", order: 0 }),
  );
  await expect(
    s.alice.client.mutation(api.projects.save, {
      ...s.input,
      trackIds: [trackId],
    }),
  ).rejects.toThrow("INVALID_TRACK");
  const cp = await s.owner.client.mutation(api.checkpoints.save, {
    eventId: other,
    title: "Otro avance",
    description: "",
    dueAt: (await s.t.run((ctx) => ctx.db.get(other)))!.timeline
      .submissionClosesAt,
    order: 0,
    expectedRevision: 0,
  });
  await expect(
    s.alice.client.mutation(api.checkpoints.submit, {
      teamId: s.teamId,
      checkpointId: cp,
      answers: { progress: "Inyectado" },
      expectedRevision: 0,
    }),
  ).rejects.toThrow("NOT_FOUND");
});
test("a foreign team's images cannot be attached to a draft", async () => {
  const s = await setup(),
    other = await s.bob.client.mutation(api.teams.create, {
      eventId: s.eventId,
      name: "Otro equipo",
      description: "",
      lookingForMembers: true,
    });
  const fileId = await s.t.run((ctx) =>
    ctx.storage.store(new Blob(["image"], { type: "image/png" })),
  );
  await s.bob.client.mutation(internal.projectFiles.registerUpload, {
    teamId: other,
    kind: "image",
    fieldId: "images",
    fileId,
    name: "image.png",
    contentType: "image/png",
  });
  await expect(
    s.alice.client.mutation(api.projects.save, {
      ...s.input,
      imageIds: [fileId],
    }),
  ).rejects.toThrow("INVALID_FILE");
});
test("merge preserves the destination draft and retargets checkpoint file access", async () => {
  const s = await setup(),
    other = await s.bob.client.mutation(api.teams.create, {
      eventId: s.eventId,
      name: "Otro equipo",
      description: "",
      lookingForMembers: true,
    });
  const formId = await s.owner.client.mutation(api.forms.save, {
    eventId: s.eventId,
    kind: "checkpoint",
    fields: [{ id: "file", label: "Avance", type: "file", required: true }],
    expectedRevision: 0,
    rulesText: DEFAULT_RULES,
    consentText: DEFAULT_CONSENT,
  });
  await s.owner.client.mutation(api.forms.publish, {
    eventId: s.eventId,
    id: formId,
    expectedRevision: 1,
  });
  const cp = await s.owner.client.mutation(api.checkpoints.save, {
    eventId: s.eventId,
    title: "Avance",
    description: "",
    dueAt: Date.now() + 60000,
    order: 0,
    expectedRevision: 0,
  });
  const fileId = await s.t.run((ctx) =>
    ctx.storage.store(new Blob(["checkpoint"], { type: "text/plain" })),
  );
  await s.alice.client.mutation(internal.projectFiles.registerUpload, {
    teamId: s.teamId,
    kind: "checkpoint",
    checkpointId: cp,
    formId,
    fieldId: "file",
    fileId,
    name: "avance.txt",
    contentType: "text/plain",
  });
  const response = await s.alice.client.mutation(api.checkpoints.submit, {
    teamId: s.teamId,
    checkpointId: cp,
    answers: { file: fileId },
    expectedRevision: 0,
  });
  await s.reviewer.client.mutation(api.checkpoints.review, {
    eventId: s.eventId,
    id: response,
    status: "accepted",
    reason: "",
    expectedRevision: 1,
  });
  await s.bob.client.mutation(api.projects.save, {
    ...s.input,
    teamId: other,
    title: "Destino conservado",
  });
  await s.alice.client.mutation(api.projects.save, s.input);
  const id = await s.alice.client.mutation(api.teams.requestMerge, {
    sourceId: s.teamId,
    targetId: other,
  });
  await s.bob.client.mutation(api.teams.resolveMerge, { id, accept: true });
  expect(
    (await s.alice.client.query(api.projects.workspace, { teamId: other }))
      .project?.title,
  ).toBe("Destino conservado");
  const r = (
    await s.alice.client.query(api.checkpoints.mine, { teamId: other })
  )[0].response!;
  expect(
    (
      await s.bob.client.query(internal.projectFiles.download, {
        checkpointSubmissionId: r.id,
        fieldId: "file",
      })
    )?.fileId,
  ).toBe(fileId);
});
test("the source leader can cancel a pending merge without touching either team's membership", async () => {
  const s = await setup(),
    target = await s.bob.client.mutation(api.teams.create, {
      eventId: s.eventId,
      name: "Destino",
      description: "",
      lookingForMembers: true,
    });
  const id = await s.alice.client.mutation(api.teams.requestMerge, {
    sourceId: s.teamId,
    targetId: target,
  });
  expect(
    (await s.alice.client.query(api.teams.mine, { eventId: s.eventId }))!
      .outgoing?.id,
  ).toBe(id);
  await expect(
    s.bob.client.mutation(api.teams.cancelMerge, { id }),
  ).rejects.toThrow("FORBIDDEN");
  await s.alice.client.mutation(api.teams.cancelMerge, { id });
  expect(
    (await s.alice.client.query(api.teams.mine, { eventId: s.eventId }))!
      .outgoing,
  ).toBeNull();
  expect(
    (await s.bob.client.query(api.teams.mine, { eventId: s.eventId }))!
      .requests,
  ).toEqual([]);
  await s.alice.client.mutation(api.teams.requestMerge, {
    sourceId: s.teamId,
    targetId: target,
  });
});
test("team finder search exposes only public team details and omits closed teams", async () => {
  const s = await setup();
  const rows = await s.bob.client.query(api.teams.find, {
    eventId: s.eventId,
    search: "Alice",
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe("Equipo Alice");
  expect(rows[0]).not.toHaveProperty("joinCode");
  expect(rows[0]).not.toHaveProperty("leaderId");
  await s.alice.client.mutation(api.teams.update, {
    teamId: s.teamId,
    name: "Equipo Alice",
    description: "",
    lookingForMembers: false,
  });
  expect(
    await s.bob.client.query(api.teams.find, {
      eventId: s.eventId,
      search: "",
    }),
  ).toEqual([]);
});
