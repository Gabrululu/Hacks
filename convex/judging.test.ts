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
import { DEFAULT_RULES, DEFAULT_CONSENT } from "./lib/formEngine";
import { normalizedScores, validateCriteria } from "./lib/judgingMath";
const modules = import.meta.glob("./**/*.ts"),
  criteria = [
    { id: "impact", name: "Impacto", weight: 60, min: 0, max: 10 },
    { id: "technical", name: "Técnica", weight: 40, min: 0, max: 5 },
  ];
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup(count = 1) {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"]) aggregateTest.register(t, `${name}Metrics`);
  async function person(name: string, role: "organizer" | "user" = "user") {
    const ids = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
          name,
          wallet: Keypair.random().publicKey(),
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
    j1 = await person("judge-one"),
    j2 = await person("judge-two"),
    lead = await person("lead"),
    outsider = await person("outsider"),
    eventId = await owner.client.mutation(api.manage.create, {
      name: "Evaluación",
      slug: "evaluacion-real",
      type: "hackathon",
      timezone: "UTC",
    });
  await t.run(async (ctx) => {
    const e = (await ctx.db.get(eventId))!;
    await ctx.db.patch(eventId, {
      status: "published",
      registrationOpen: true,
      timeline: {
        registrationOpensAt: Date.now() - 3600000,
        registrationClosesAt: Date.now() + 1000,
        startsAt: Date.now() - 1000,
        submissionOpensAt: Date.now() - 1000,
        submissionClosesAt: Date.now() + 1000,
        judgingClosesAt: Date.now() + 3600000,
        resultsAt: Date.now() + 3600001,
      },
      settings: {
        ...e.settings,
        admission: "auto",
        requiredCheckpoints: 0,
        teamSizeMin: 1,
        judgesPerSubmission: 2,
      },
    });
    for (const [p, role] of [
      [j1, "judge"],
      [j2, "judge"],
      [lead, "judge_lead"],
    ] as const)
      await ctx.db.insert("eventStaff", { eventId, userId: p.id, role });
  });
  const formId = await owner.client.mutation(api.forms.save, {
    eventId,
    kind: "registration",
    fields: [],
    rulesText: DEFAULT_RULES,
    consentText: DEFAULT_CONSENT,
    expectedRevision: 0,
  });
  await owner.client.mutation(api.forms.publish, {
    eventId,
    id: formId,
    expectedRevision: 1,
  });
  const subForm = await owner.client.mutation(api.forms.save, {
    eventId,
    kind: "submission",
    fields: [
      {
        id: "private",
        label: "Solo organización",
        type: "short_text",
        required: false,
        staffVisibility: "organizers",
      },
      {
        id: "file",
        label: "Documentación",
        type: "file",
        required: false,
        validation: { accept: "text/plain" },
      },
    ],
    rulesText: DEFAULT_RULES,
    consentText: DEFAULT_CONSENT,
    expectedRevision: 0,
  });
  await owner.client.mutation(api.forms.publish, {
    eventId,
    id: subForm,
    expectedRevision: 1,
  });
  const projects = [];
  for (let i = 0; i < count; i++) {
    const p = await person(`builder-${i}`);
    await p.client.mutation(api.registrations.submit, {
      eventId,
      formId,
      answers: {},
      rulesAccepted: true,
      consentAccepted: true,
      emailOptOut: false,
    });
    const teamId = await p.client.mutation(api.teams.create, {
      eventId,
      name: `Equipo ${i}`,
      description: "",
      lookingForMembers: true,
    });
    const fileId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(["Documento del proyecto"], { type: "text/plain" }),
      ),
    );
    await p.client.mutation(internal.projectFiles.registerUpload, {
      teamId,
      kind: "submission",
      fieldId: "file",
      formId: subForm,
      fileId,
      name: "documento.txt",
      contentType: "text/plain",
    });
    const id = await p.client.mutation(api.projects.save, {
      teamId,
      title: `Proyecto ${i}`,
      summary: "Una entrega final completa para evaluar con los jueces.",
      trackIds: [],
      imageIds: [],
      answers: { private: "Secreto", file: fileId },
      expectedRevision: 0,
    });
    await p.client.mutation(api.projects.submit, { id, expectedRevision: 1 });
    await owner.client.mutation(api.projects.review, {
      eventId,
      id,
      status: "admitted",
      reason: "",
      expectedRevision: 2,
    });
    projects.push({ id, teamId, person: p, fileId });
  }
  vi.advanceTimersByTime(1001);
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const roundId = await owner.client.mutation(api.judging.saveRound, {
    eventId,
    name: "Final",
    order: 0,
    criteria,
    minReviews: 1,
    tieBreakCriterion: "impact",
    expectedRevision: 0,
  });
  return {
    t,
    owner,
    j1,
    j2,
    lead,
    outsider,
    eventId,
    roundId,
    projects,
    person,
  };
}
async function assignment(
  s: Awaited<ReturnType<typeof setup>>,
  p = 0,
  j = s.j1,
) {
  return s.owner.client.mutation(api.judging.assign, {
    eventId: s.eventId,
    roundId: s.roundId,
    judgeId: j.id,
    submissionId: s.projects[p].id,
  });
}
async function open(s: Awaited<ReturnType<typeof setup>>) {
  await s.owner.client.mutation(api.judging.openRound, {
    eventId: s.eventId,
    roundId: s.roundId,
    expectedRevision: 1,
  });
}
async function score(
  s: Awaited<ReturnType<typeof setup>>,
  id: import("./_generated/dataModel").Id<"judgeAssignments">,
  judge = s.j1,
  values = { impact: 8, technical: 4 },
  privateNote = "Privado",
  publicFeedback = "Buen trabajo",
) {
  return judge.client.mutation(api.judging.saveScore, {
    id,
    criteria: values,
    privateNote,
    publicFeedback,
    expectedRevision: 1,
  });
}
async function close(s: Awaited<ReturnType<typeof setup>>, force = false) {
  await s.owner.client.mutation(api.judging.closeRound, {
    eventId: s.eventId,
    roundId: s.roundId,
    expectedRevision: 2,
    force,
  });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
}
test("rubrics validate weights, scales, identifiers and normalize different scales fairly", () => {
  expect(normalizedScores(criteria, { impact: 8, technical: 4 }).total).toBe(
    80,
  );
  expect(() => validateCriteria([{ ...criteria[0], weight: 0 }])).toThrow(
    "INVALID_RUBRIC",
  );
  expect(() => validateCriteria([{ ...criteria[0], max: 0 }])).toThrow(
    "INVALID_RUBRIC",
  );
  expect(() => validateCriteria([criteria[0], criteria[0]])).toThrow(
    "INVALID_RUBRIC",
  );
  expect(() =>
    normalizedScores(criteria, { impact: 11, technical: 4 }),
  ).toThrow("INVALID_SCORE");
  expect(() =>
    normalizedScores(criteria, { impact: 8, technical: 4, extra: 1 }),
  ).toThrow("INVALID_SCORE");
});
test("only judging managers can configure rounds and outsiders cannot read their assignments", async () => {
  const s = await setup();
  await expect(
    s.outsider.client.query(api.judging.setup, { eventId: s.eventId }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.j1.client.mutation(api.judging.saveRound, {
      eventId: s.eventId,
      name: "Robada",
      order: 1,
      criteria,
      minReviews: 1,
      expectedRevision: 0,
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    s.j1.client.query(api.judging.listAssignments, {
      eventId: s.eventId,
      roundId: s.roundId,
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  ).rejects.toThrow("FORBIDDEN");
});
test("custom result and rubric permissions permit management reads without granting assignment writes", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.insert("eventStaff", {
      eventId: s.eventId,
      userId: s.outsider.id,
      role: "mentor",
      extraPermissions: ["results.publish"],
      revokedPermissions: ["mentors.manage"],
    }),
  );
  expect(
    (await s.outsider.client.query(api.judging.setup, { eventId: s.eventId }))
      .rounds,
  ).toHaveLength(1);
  await expect(
    s.outsider.client.mutation(api.judging.assign, {
      eventId: s.eventId,
      roundId: s.roundId,
      judgeId: s.j1.id,
      submissionId: s.projects[0].id,
    }),
  ).rejects.toThrow("FORBIDDEN");
});
test("assignments enforce admission, event scope and conflict of interest", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.insert("eventStaff", {
      eventId: s.eventId,
      userId: s.projects[0].person.id,
      role: "judge",
    }),
  );
  await expect(assignment(s, 0, s.projects[0].person)).rejects.toThrow(
    "CONFLICT_OF_INTEREST",
  );
  await expect(assignment(s, 0, s.outsider)).rejects.toThrow("INVALID_JUDGE");
  await s.t.run((ctx) =>
    ctx.db.patch(s.projects[0].id, { status: "submitted" }),
  );
  await expect(assignment(s)).rejects.toThrow("PROJECT_NOT_ADMITTED");
});
test("each judge gets a stable randomized project order with offset pagination", async () => {
  const s = await setup(8);
  for (let i = 0; i < s.projects.length; i++) {
    await assignment(s, i, s.j1);
    await assignment(s, i, s.j2);
  }
  const list = (judge: typeof s.j1, cursor: string | null, numItems: number) =>
    judge.client.query(api.judging.myAssignments, {
      eventId: s.eventId,
      paginationOpts: { cursor, numItems },
    });
  const firstJudge = await list(s.j1, null, 100),
    secondJudge = await list(s.j2, null, 100),
    repeated = await list(s.j1, null, 100),
    firstPage = await list(s.j1, null, 3),
    secondPage = await list(s.j1, firstPage.continueCursor, 3);
  expect(firstJudge.page.map((row) => row.id)).toEqual(
    repeated.page.map((row) => row.id),
  );
  expect(firstJudge.page.map((row) => row.title)).not.toEqual(
    secondJudge.page.map((row) => row.title),
  );
  expect(firstJudge.page.map((row) => row.position)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8,
  ]);
  expect(firstJudge.page.every((row) => row.total === 8)).toBe(true);
  expect(firstJudge.page.map((row) => row.roundName)).toEqual(
    Array(8).fill("Final"),
  );
  expect(
    [...firstPage.page, ...secondPage.page].map((row) => row.id),
  ).toEqual(firstJudge.page.slice(0, 6).map((row) => row.id));
  expect(secondPage.page[0].position).toBe(4);
});
test("a judge only reads their assigned version and cannot see organizer-only fields", async () => {
  const s = await setup(),
    id = await assignment(s);
  await expect(
    s.j2.client.query(api.judging.assignment, { id }),
  ).rejects.toThrow("FORBIDDEN");
  const data = await s.j1.client.query(api.judging.assignment, { id });
  expect(data.project.answers).not.toHaveProperty("private");
  expect(data.project.fields.some((f) => f.id === "private")).toBe(false);
  expect(
    (
      await s.j1.client.query(internal.projectFiles.download, {
        versionId: data.project.versionId,
        fieldId: "file",
      })
    )?.fileId,
  ).toBe(s.projects[0].fileId);
  expect(
    await s.j2.client.query(internal.projectFiles.download, {
      versionId: data.project.versionId,
      fieldId: "file",
    }),
  ).toBeNull();
});
test("revoked judges lose evaluation and file access", async () => {
  const s = await setup(),
    id = await assignment(s),
    data = await s.j1.client.query(api.judging.assignment, { id });
  await s.t.run(async (ctx) => {
    const row = (await ctx.db
      .query("eventStaff")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", s.eventId).eq("userId", s.j1.id),
      )
      .unique())!;
    await ctx.db.patch(row._id, { revokedAt: Date.now() });
  });
  await expect(
    s.j1.client.query(api.judging.assignment, { id }),
  ).rejects.toThrow("FORBIDDEN");
  expect(
    await s.j1.client.query(internal.projectFiles.download, {
      versionId: data.project.versionId,
      fieldId: "file",
    }),
  ).toBeNull();
});
test("opening freezes rubric, admission, deadlines and project edits", async () => {
  const s = await setup(),
    id = await assignment(s);
  await open(s);
  await expect(
    s.owner.client.mutation(api.judging.saveRound, {
      eventId: s.eventId,
      id: s.roundId,
      name: "Cambiada",
      order: 0,
      criteria,
      minReviews: 1,
      expectedRevision: 2,
    }),
  ).rejects.toThrow("ROUND_LOCKED");
  await expect(
    s.owner.client.mutation(api.projects.review, {
      eventId: s.eventId,
      id: s.projects[0].id,
      status: "disqualified",
      reason: "Tarde",
      expectedRevision: 3,
    }),
  ).rejects.toThrow("REVIEW_CLOSED");
  await expect(
    s.owner.client.mutation(api.judging.removeAssignment, {
      eventId: s.eventId,
      id,
    }),
  ).rejects.toThrow("ROUND_LOCKED");
  const e = (await s.t.run((ctx) => ctx.db.get(s.eventId)))!;
  await expect(
    s.owner.client.mutation(api.manage.update, {
      eventId: s.eventId,
      name: e.name,
      tagline: e.tagline ?? "",
      description: e.description ?? "",
      format: e.format,
      timezone: e.timezone,
      location: e.location ?? "",
      timeline: { ...e.timeline, submissionClosesAt: Date.now() + 60000 },
      settings: e.settings,
    }),
  ).rejects.toThrow("JUDGING_STARTED");
});
test("scores require complete valid criteria and reject stale or foreign updates", async () => {
  const s = await setup(),
    id = await assignment(s);
  await expect(score(s, id)).rejects.toThrow("JUDGING_CLOSED");
  await open(s);
  await expect(score(s, id, s.j2)).rejects.toThrow("FORBIDDEN");
  await expect(
    score(s, id, s.j1, { impact: 12, technical: 4 }),
  ).rejects.toThrow("INVALID_SCORE");
  await score(s, id);
  await expect(score(s, id)).rejects.toThrow("JUDGING_CONFLICT");
  const data = await s.j1.client.query(api.judging.assignment, { id });
  expect(data.score?.criteria).toEqual({ impact: 8, technical: 4 });
});
test("abstention is reasoned, excluded from scoring and blocks private file downloads", async () => {
  const s = await setup(),
    id = await assignment(s);
  await open(s);
  await expect(
    s.j1.client.mutation(api.judging.abstain, {
      id,
      reason: "",
      expectedRevision: 1,
    }),
  ).rejects.toThrow("INVALID_ABSTENTION");
  const d = await s.j1.client.query(api.judging.assignment, { id });
  await s.j1.client.mutation(api.judging.abstain, {
    id,
    reason: "Conozco personalmente al equipo",
    expectedRevision: 1,
  });
  await expect(
    s.j1.client.mutation(api.judging.saveScore, {
      id,
      criteria: { impact: 8, technical: 4 },
      privateNote: "",
      publicFeedback: "",
      expectedRevision: 2,
    }),
  ).rejects.toThrow("JUDGE_ABSTAINED");
  expect(
    await s.j1.client.query(internal.projectFiles.download, {
      versionId: d.project.versionId,
      fieldId: "file",
    }),
  ).toBeNull();
});
test("private notes are reserved for organizers while judge leads see progress", async () => {
  const s = await setup(),
    id = await assignment(s);
  await open(s);
  await score(s, id);
  const args = {
    eventId: s.eventId,
    roundId: s.roundId,
    paginationOpts: { cursor: null, numItems: 20 },
  };
  expect(
    (await s.owner.client.query(api.judging.listAssignments, args)).page[0]
      .privateNote,
  ).toBe("Privado");
  expect(
    (await s.lead.client.query(api.judging.listAssignments, args)).page[0]
      .privateNote,
  ).toBeNull();
});
test("automatic assignment balances load, respects capacity and resumes without duplicates", async () => {
  const s = await setup(4);
  await s.owner.client.mutation(api.judging.autoAssign, {
    eventId: s.eventId,
    roundId: s.roundId,
    judges: [s.j1.id, s.j2.id],
    perProject: 1,
    maxPerJudge: 2,
  });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const rows = (
    await s.owner.client.query(api.judging.listAssignments, {
      eventId: s.eventId,
      roundId: s.roundId,
      paginationOpts: { cursor: null, numItems: 20 },
    })
  ).page;
  expect(rows).toHaveLength(4);
  expect(rows.filter((r) => r.assignment.judgeId === s.j1.id)).toHaveLength(2);
  expect(rows.filter((r) => r.assignment.judgeId === s.j2.id)).toHaveLength(2);
  await s.owner.client.mutation(api.judging.autoAssign, {
    eventId: s.eventId,
    roundId: s.roundId,
    judges: [s.j1.id, s.j2.id],
    perProject: 1,
    maxPerJudge: 2,
  });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(
    (
      await s.owner.client.query(api.judging.listAssignments, {
        eventId: s.eventId,
        roundId: s.roundId,
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).page,
  ).toHaveLength(4);
});
test("automatic assignment excludes self teams and reports uncovered projects", async () => {
  const s = await setup(2);
  await s.t.run((ctx) =>
    ctx.db.insert("eventStaff", {
      eventId: s.eventId,
      userId: s.projects[0].person.id,
      role: "judge",
    }),
  );
  await s.owner.client.mutation(api.judging.autoAssign, {
    eventId: s.eventId,
    roundId: s.roundId,
    judges: [s.projects[0].person.id],
    perProject: 1,
    maxPerJudge: 1,
  });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const rows = (
    await s.owner.client.query(api.judging.listAssignments, {
      eventId: s.eventId,
      roundId: s.roundId,
      paginationOpts: { cursor: null, numItems: 20 },
    })
  ).page;
  expect(rows).toHaveLength(1);
  expect(rows[0].assignment.submissionId).toBe(s.projects[1].id);
  expect((await s.t.run((ctx) => ctx.db.get(s.roundId)))?.autoUnfilled).toBe(1);
});
test("cancelled automatic jobs stop safely before creating assignments", async () => {
  const s = await setup(2);
  await s.owner.client.mutation(api.judging.autoAssign, {
    eventId: s.eventId,
    roundId: s.roundId,
    judges: [s.j1.id],
    perProject: 1,
    maxPerJudge: 2,
  });
  await s.owner.client.mutation(api.judging.cancelAuto, {
    eventId: s.eventId,
    roundId: s.roundId,
  });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(
    (
      await s.owner.client.query(api.judging.listAssignments, {
        eventId: s.eventId,
        roundId: s.roundId,
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).page,
  ).toHaveLength(0);
});
test("round closing requires pending-score consent and permanently freezes scores", async () => {
  const s = await setup(),
    id = await assignment(s);
  await open(s);
  await expect(close(s)).rejects.toThrow("EVALUATIONS_PENDING");
  await close(s, true);
  await expect(score(s, id)).rejects.toThrow("JUDGING_CLOSED");
  const ranking = await s.owner.client.query(api.judging.ranking, {
    eventId: s.eventId,
    roundId: s.roundId,
    eligible: false,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(ranking.page[0].eligible).toBe(false);
  expect(ranking.page[0].rank).toBeNull();
});
test("ranking averages normalized scores and publishes only after explicit closure", async () => {
  const s = await setup(2),
    a = await assignment(s, 0),
    b = await assignment(s, 1),
    c = await assignment(s, 0, s.j2);
  await open(s);
  await score(
    s,
    a,
    s.j1,
    { impact: 10, technical: 5 },
    "Nunca público",
    "Gran impacto",
  );
  await score(
    s,
    c,
    s.j2,
    { impact: 8, technical: 4 },
    "Otra nota privada",
    "Buen prototipo",
  );
  await score(s, b, s.j1, { impact: 7, technical: 3.5 });
  const args = {
    slug: "evaluacion-real",
    paginationOpts: { cursor: null, numItems: 20 },
  };
  expect((await s.t.query(api.judging.publicRanking, args)).page.page).toEqual(
    [],
  );
  await close(s);
  const rank = await s.owner.client.query(api.judging.ranking, {
    eventId: s.eventId,
    roundId: s.roundId,
    eligible: true,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(rank.page.map((r) => r.score)).toEqual([90, 70]);
  expect(rank.page.map((r) => r.rank)).toEqual([1, 2]);
  await expect(
    s.owner.client.mutation(api.judging.publish, {
      eventId: s.eventId,
      roundId: s.roundId,
      winnerCount: 1,
    }),
  ).rejects.toThrow("RESULTS_NOT_READY");
  await s.owner.client.mutation(api.judging.closeEvent, { eventId: s.eventId });
  await s.owner.client.mutation(api.judging.publish, {
    eventId: s.eventId,
    roundId: s.roundId,
    winnerCount: 1,
  });
  const pub = await s.t.query(api.judging.publicRanking, args);
  expect(pub.page.page[0].publicFeedback).toEqual([
    "Gran impacto",
    "Buen prototipo",
  ]);
  expect(JSON.stringify(pub)).not.toContain("Nunca público");
  expect(pub.winnerCount).toBe(1);
  expect(pub.page.page[0]).not.toHaveProperty("privateNote");
});
test("criterion tie-break resolves equal weighted scores", async () => {
  const s = await setup(2),
    a = await assignment(s, 0),
    b = await assignment(s, 1);
  await open(s);
  await score(s, a, s.j1, { impact: 10, technical: 0 });
  await score(s, b, s.j1, { impact: 5, technical: 3.75 });
  await close(s);
  const rank = await s.owner.client.query(api.judging.ranking, {
    eventId: s.eventId,
    roundId: s.roundId,
    eligible: true,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(rank.page.map((r) => r.score)).toEqual([60, 60]);
  expect(rank.page[0].submissionId).toBe(s.projects[0].id);
});
test("round progression waits for the previous ranking and publishes the final round", async () => {
  const s = await setup(),
    id = await assignment(s);
  const final = await s.owner.client.mutation(api.judging.saveRound, {
    eventId: s.eventId,
    name: "Otra final",
    order: 1,
    criteria,
    minReviews: 1,
    expectedRevision: 0,
  });
  await s.owner.client.mutation(api.judging.assign, {
    eventId: s.eventId,
    roundId: final,
    judgeId: s.j1.id,
    submissionId: s.projects[0].id,
  });
  await expect(
    s.owner.client.mutation(api.judging.openRound, {
      eventId: s.eventId,
      roundId: final,
      expectedRevision: 1,
    }),
  ).rejects.toThrow("PREVIOUS_ROUND_OPEN");
  await open(s);
  await score(s, id);
  await close(s);
  await s.owner.client.mutation(api.judging.openRound, {
    eventId: s.eventId,
    roundId: final,
    expectedRevision: 1,
  });
  await expect(
    s.owner.client.mutation(api.judging.closeEvent, { eventId: s.eventId }),
  ).rejects.toThrow("ROUNDS_NOT_CLOSED");
});
test("the deadline and global close flag reject even previously valid score mutations", async () => {
  const s = await setup(),
    id = await assignment(s);
  await open(s);
  await s.t.run((ctx) => ctx.db.patch(s.eventId, { judgingClosed: true }));
  await expect(score(s, id)).rejects.toThrow("JUDGING_CLOSED");
  await s.t.run((ctx) => ctx.db.patch(s.eventId, { judgingClosed: false }));
  vi.advanceTimersByTime(3600000);
  await expect(score(s, id)).rejects.toThrow("JUDGING_CLOSED");
});
