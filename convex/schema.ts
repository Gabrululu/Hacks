import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { criterion, resultState } from "./lib/judgingValidators";
import { deliveryStatus } from "./lib/emailValidators";
import { theme, block, field, answer, audience } from "./lib/validators";

const eventRole = v.union(
  v.literal("owner"),
  v.literal("co_organizer"),
  v.literal("reviewer"),
  v.literal("judge_lead"),
  v.literal("judge"),
  v.literal("mentor"),
  v.literal("comms"),
);

export default defineSchema({
  testFixtures: defineTable({ wallet: v.string(), runId: v.string() })
    .index("by_wallet", ["wallet"])
    .index("by_runId", ["runId"]),
  // ── Plataforma ─────────────────────────────────────
  users: defineTable({
    wallet: v.string(),
    tokenIdentifier: v.optional(v.string()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerifiedAt: v.optional(v.number()),
    avatarId: v.optional(v.id("_storage")),
    bio: v.optional(v.string()),
    links: v.optional(
      v.object({
        github: v.optional(v.string()),
        x: v.optional(v.string()),
        linkedin: v.optional(v.string()),
      }),
    ),
    platformRole: v.union(
      v.literal("superadmin"),
      v.literal("organizer"),
      v.literal("user"),
    ),
    suspendedAt: v.optional(v.number()),
    suspensionReason: v.optional(v.string()),
    sessionVersion: v.optional(v.number()),
    eventLimit: v.optional(v.number()),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_wallet", ["wallet"])
    .index("by_email", ["email"])
    .index("by_role", ["platformRole"]),

  authChallenges: defineTable({
    wallet: v.string(),
    nonce: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    xdr: v.optional(v.string()),
    network: v.optional(v.union(v.literal("testnet"), v.literal("mainnet"))),
    attempts: v.optional(v.number()),
  })
    .index("by_nonce", ["nonce"])
    .index("by_wallet", ["wallet"])
    .index("by_expiresAt", ["expiresAt"]),

  authSessions: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    userSessionVersion: v.optional(v.number()),
    network: v.union(v.literal("testnet"), v.literal("mainnet")),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  emailVerifications: defineTable({
    deliveryStatus: v.optional(deliveryStatus),
    userId: v.id("users"),
    email: v.string(),
    codeHash: v.string(),
    nonce: v.optional(v.string()),
    usedAt: v.optional(v.number()),
    delivery: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("development"),
        v.literal("failed"),
      ),
    ),
    developmentCode: v.optional(v.string()),
    expiresAt: v.number(),
    attempts: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  organizerApplications: defineTable({
    userId: v.id("users"),
    org: v.string(),
    motivation: v.string(),
    links: v.array(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_user", ["userId"]),

  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_creator", ["createdBy"]),
  organizationMembers: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("organizer")),
    invitedBy: v.id("users"),
    joinedAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_organization_and_user", ["organizationId", "userId"])
    .index("by_user_and_revokedAt", ["userId", "revokedAt"]),

  // ── Evento ─────────────────────────────────────────
  events: defineTable({
    slug: v.string(),
    domainSlug: v.optional(v.string()),
    ownerId: v.id("users"),
    organizationId: v.optional(v.id("organizations")),
    type: v.union(
      v.literal("hackathon"),
      v.literal("ideathon"),
      v.literal("buildathon"),
      v.literal("bootcamp"),
      v.literal("demo_day"),
      v.literal("other"),
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
      v.literal("suspended"),
    ),
    suspendedAt: v.optional(v.number()),
    suspensionReason: v.optional(v.string()),
    statusBeforeSuspension: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("published"),
        v.literal("archived"),
      ),
    ),
    name: v.string(),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
    prize: v.optional(v.string()),
    art: v.optional(v.string()),
    format: v.union(
      v.literal("online"),
      v.literal("onsite"),
      v.literal("hybrid"),
    ),
    location: v.optional(v.string()),
    timezone: v.string(),
    timeline: v.object({
      registrationOpensAt: v.number(),
      registrationClosesAt: v.number(),
      startsAt: v.number(),
      submissionOpensAt: v.number(),
      submissionClosesAt: v.number(),
      judgingClosesAt: v.number(),
      resultsAt: v.optional(v.number()),
    }),
    settings: v.object({
      admission: v.union(
        v.literal("auto"),
        v.literal("manual"),
        v.literal("capped"),
      ),
      capacity: v.optional(v.number()),
      teamSizeMin: v.number(),
      teamSizeMax: v.number(),
      requiredCheckpoints: v.number(),
      judgesPerSubmission: v.number(),
      publicGallery: v.boolean(),
    }),
    socialCards: v.optional(
      v.object({
        enabled: v.boolean(),
        personalGalleryEnabled: v.boolean(),
        projectCardsEnabled: v.boolean(),
        templateId: v.string(),
        copyText: v.string(),
        officialName: v.optional(v.string()),
        officialLogoId: v.optional(v.id("_storage")),
        socialHandles: v.optional(
          v.object({
            x: v.optional(v.string()),
            linkedin: v.optional(v.string()),
          }),
        ),
        projectLinks: v.object({
          repo: v.boolean(),
          demo: v.boolean(),
          video: v.boolean(),
        }),
      }),
    ),
    emailMonthlyLimit: v.optional(v.number()),
    theme, // validar con el validador de tema en model/events.ts
    blocks: v.array(block), // ídem, validador por tipo de bloque
    presentationVersion: v.optional(v.number()),
    publicPhase: v.optional(v.string()),
    registrationOpen: v.optional(v.boolean()),
    phaseRevision: v.optional(v.number()),
    judgingClosed: v.boolean(),
    resultsPublished: v.boolean(),
    judgingStartedAt: v.optional(v.number()),
    finalRoundId: v.optional(v.id("judgingRounds")),
    winnerCount: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_domainSlug", ["domainSlug"])
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"])
    .index("by_owner_and_status", ["ownerId", "status"])
    .index("by_organization", ["organizationId"]),

  eventStaff: defineTable({
    revokedAt: v.optional(v.number()),
    eventId: v.id("events"),
    userId: v.id("users"),
    role: eventRole,
    extraPermissions: v.optional(v.array(v.string())),
    revokedPermissions: v.optional(v.array(v.string())),
  })
    .index("by_event_user", ["eventId", "userId"])
    .index("by_user", ["userId"])
    .index("by_event_role", ["eventId", "role"])
    .index("by_user_and_revokedAt", ["userId", "revokedAt"])
    .index("by_event_and_revokedAt", ["eventId", "revokedAt"]),

  staffInvites: defineTable({
    revokedAt: v.optional(v.number()),
    eventId: v.id("events"),
    role: eventRole,
    tokenHash: v.string(),
    wallet: v.optional(v.string()),
    email: v.optional(v.string()),
    expiresAt: v.number(),
    claimedBy: v.optional(v.id("users")),
    createdBy: v.id("users"),
  })
    .index("by_token", ["tokenHash"])
    .index("by_event", ["eventId"]),

  tracks: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    prize: v.optional(v.string()),
    order: v.number(),
  }).index("by_event", ["eventId"]),

  eventAssets: defineTable({
    eventId: v.id("events"),
    fileId: v.id("_storage"),
    kind: v.union(v.literal("image"), v.literal("resource")),
    name: v.string(),
    createdBy: v.id("users"),
  })
    .index("by_event", ["eventId"])
    .index("by_fileId", ["fileId"]),

  // ── Formularios ────────────────────────────────────
  forms: defineTable({
    eventId: v.id("events"),
    kind: v.union(
      v.literal("registration"),
      v.literal("submission"),
      v.literal("checkpoint"),
      v.literal("feedback"),
    ),
    version: v.number(),
    fields: v.array(field),
    publishedAt: v.optional(v.number()),
    revision: v.optional(v.number()),
    consentText: v.optional(v.string()),
    rulesText: v.optional(v.string()),
  })
    .index("by_event_kind", ["eventId", "kind"])
    .index("by_event_kind_and_version", ["eventId", "kind", "version"]),

  // ── Participación ──────────────────────────────────
  registrations: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("waitlisted"),
      v.literal("checked_in"),
      v.literal("withdrawn"),
    ),
    formVersion: v.number(),
    formId: v.optional(v.id("forms")),
    fieldSnapshot: v.optional(v.array(field)),
    nameSnapshot: v.optional(v.string()),
    emailSnapshot: v.optional(v.string()),
    walletSnapshot: v.optional(v.string()),
    consentText: v.optional(v.string()),
    rulesText: v.optional(v.string()),
    rulesAcceptedAt: v.optional(v.number()),
    revision: v.optional(v.number()),
    checkedInAt: v.optional(v.number()),
    checkedInBy: v.optional(v.id("users")),
    answers: v.record(v.string(), answer),
    consentAt: v.number(),
    reviewedBy: v.optional(v.id("users")),
    emailOptOut: v.boolean(),
  })
    .index("by_event_user", ["eventId", "userId"])
    .index("by_event_status", ["eventId", "status"])
    .index("by_user", ["userId"]),

  registrationTotals: defineTable({
    eventId: v.id("events"),
    admitted: v.number(),
  }).index("by_eventId", ["eventId"]),
  registrationUploads: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    formId: v.id("forms"),
    fieldId: v.string(),
    fileId: v.id("_storage"),
    name: v.string(),
  })
    .index("by_fileId", ["fileId"])
    .index("by_eventId_and_userId", ["eventId", "userId"]),
  registrationNotifications: defineTable({
    deliveryStatus: v.optional(deliveryStatus),
    eventId: v.id("events"),
    registrationId: v.id("registrations"),
    userId: v.id("users"),
    revision: v.number(),
    status: v.string(),
    subject: v.string(),
    body: v.string(),
    delivery: v.union(
      v.literal("queued"),
      v.literal("development"),
      v.literal("sent"),
      v.literal("failed"),
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_eventId_and_userId", ["eventId", "userId"]),

  teams: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    joinCode: v.string(),
    leaderId: v.id("users"),
    lookingForMembers: v.boolean(),
    active: v.optional(v.boolean()),
    description: v.optional(v.string()),
    memberCount: v.optional(v.number()),
    mergedInto: v.optional(v.id("teams")),
  })
    .index("by_event", ["eventId"])
    .index("by_join_code", ["joinCode"])
    .index("by_eventId_and_active", ["eventId", "active"])
    .index("by_eventId_and_lookingForMembers_and_active", [
      "eventId",
      "lookingForMembers",
      "active",
    ])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["eventId", "lookingForMembers", "active"],
    }),

  teamMembers: defineTable({
    eventId: v.id("events"),
    teamId: v.id("teams"),
    userId: v.id("users"),
    joinedAt: v.number(),
  })
    .index("by_event_team", ["eventId", "teamId"])
    .index("by_event_user", ["eventId", "userId"])
    .index("by_userId", ["userId"]),

  checkpoints: defineTable({
    eventId: v.id("events"),
    title: v.string(),
    description: v.optional(v.string()),
    dueAt: v.number(),
    formId: v.optional(v.id("forms")),
    fieldSnapshot: v.optional(v.array(field)),
    formVersion: v.optional(v.number()),
    revision: v.optional(v.number()),
    order: v.number(),
  }).index("by_event", ["eventId"]),

  checkpointSubmissions: defineTable({
    eventId: v.id("events"),
    checkpointId: v.id("checkpoints"),
    teamId: v.id("teams"),
    answers: v.record(v.string(), answer),
    submittedAt: v.number(),
    submittedBy: v.optional(v.id("users")),
    formVersion: v.optional(v.number()),
    fieldSnapshot: v.optional(v.array(field)),
    revision: v.optional(v.number()),
    reviewReason: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    originTeamId: v.optional(v.id("teams")),
    status: v.union(
      v.literal("submitted"),
      v.literal("accepted"),
      v.literal("rejected"),
    ),
  })
    .index("by_event_team", ["eventId", "teamId"])
    .index("by_event_checkpoint", ["eventId", "checkpointId"])
    .index("by_eventId_and_teamId_and_checkpointId", [
      "eventId",
      "teamId",
      "checkpointId",
    ]),

  submissions: defineTable({
    eventId: v.id("events"),
    teamId: v.id("teams"),
    title: v.string(),
    summary: v.string(),
    trackIds: v.array(v.id("tracks")),
    repoUrl: v.optional(v.string()),
    demoUrl: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    contractId: v.optional(v.string()),
    imageIds: v.array(v.id("_storage")),
    projectLogoId: v.optional(v.id("_storage")),
    formVersion: v.number(),
    answers: v.record(v.string(), answer),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("admitted"),
      v.literal("disqualified"),
    ),
    submittedAt: v.optional(v.number()),
    formId: v.optional(v.id("forms")),
    fieldSnapshot: v.optional(v.array(field)),
    revision: v.optional(v.number()),
    submissionVersion: v.optional(v.number()),
    reviewReason: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
  })
    .index("by_event_status", ["eventId", "status"])
    .index("by_event_team", ["eventId", "teamId"]),

  teamMergeRequests: defineTable({
    eventId: v.id("events"),
    sourceId: v.id("teams"),
    targetId: v.id("teams"),
    requestedBy: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
    ),
  })
    .index("by_eventId_and_targetId_and_status", [
      "eventId",
      "targetId",
      "status",
    ])
    .index("by_eventId_and_sourceId_and_status", [
      "eventId",
      "sourceId",
      "status",
    ]),
  projectUploads: defineTable({
    eventId: v.id("events"),
    teamId: v.id("teams"),
    userId: v.id("users"),
    kind: v.union(
      v.literal("image"),
      v.literal("submission"),
      v.literal("checkpoint"),
    ),
    checkpointId: v.optional(v.id("checkpoints")),
    formId: v.optional(v.id("forms")),
    fieldId: v.string(),
    fileId: v.id("_storage"),
    name: v.string(),
  })
    .index("by_fileId", ["fileId"])
    .index("by_eventId_and_teamId", ["eventId", "teamId"]),
  personalEventCards: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    role: v.union(
      v.literal("participant"),
      v.literal("mentor"),
      v.literal("judge"),
    ),
    displayName: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_event_user", ["eventId", "userId"])
    .index("by_event_and_publishedAt", ["eventId", "publishedAt"]),
  personalCardUploads: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    fileId: v.id("_storage"),
    contentType: v.string(),
    createdAt: v.number(),
  })
    .index("by_fileId", ["fileId"])
    .index("by_event_and_user", ["eventId", "userId"]),
  submissionVersions: defineTable({
    eventId: v.id("events"),
    submissionId: v.id("submissions"),
    teamId: v.id("teams"),
    version: v.number(),
    submittedBy: v.id("users"),
    submittedAt: v.number(),
    title: v.string(),
    summary: v.string(),
    trackIds: v.array(v.id("tracks")),
    repoUrl: v.optional(v.string()),
    demoUrl: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    contractId: v.optional(v.string()),
    imageIds: v.array(v.id("_storage")),
    formVersion: v.number(),
    fieldSnapshot: v.array(field),
    answers: v.record(v.string(), answer),
  })
    .index("by_eventId_and_submissionId", ["eventId", "submissionId"])
    .index("by_eventId_and_teamId", ["eventId", "teamId"]),
  // ── Evaluación ─────────────────────────────────────
  rubrics: defineTable({
    eventId: v.id("events"),
    roundId: v.optional(v.id("judgingRounds")),
    criteria: v.array(criterion),
    revision: v.optional(v.number()),
  })
    .index("by_event", ["eventId"])
    .index("by_eventId_and_roundId", ["eventId", "roundId"]),

  judgingRounds: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    order: v.number(),
    revision: v.optional(v.number()),
    minReviews: v.optional(v.number()),
    tieBreakCriterion: v.optional(v.string()),
    resultsState: v.optional(resultState),
    resultsError: v.optional(v.string()),
    openedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    autoState: v.optional(
      v.union(
        v.literal("running"),
        v.literal("completed"),
        v.literal("cancelled"),
        v.literal("failed"),
      ),
    ),
    autoRevision: v.optional(v.number()),
    autoError: v.optional(v.string()),
    autoUnfilled: v.optional(v.number()),
    autoAssigned: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("open"),
      v.literal("closed"),
    ),
  }).index("by_event", ["eventId"]),

  judgeAssignments: defineTable({
    eventId: v.id("events"),
    roundId: v.id("judgingRounds"),
    judgeId: v.id("users"),
    submissionId: v.id("submissions"),
    status: v.union(
      v.literal("assigned"),
      v.literal("scored"),
      v.literal("abstained"),
    ),
    abstainReason: v.optional(v.string()),
    versionId: v.optional(v.id("submissionVersions")),
    revision: v.optional(v.number()),
  })
    .index("by_event_judge_round", ["eventId", "judgeId", "roundId"])
    .index("by_event_submission", ["eventId", "submissionId"])
    .index("by_event_round", ["eventId", "roundId"])
    .index("by_eventId_and_roundId_and_submissionId", [
      "eventId",
      "roundId",
      "submissionId",
    ])
    .index("by_eventId_and_roundId_and_status", [
      "eventId",
      "roundId",
      "status",
    ]),

  scores: defineTable({
    eventId: v.id("events"),
    assignmentId: v.id("judgeAssignments"),
    submissionId: v.id("submissions"),
    judgeId: v.id("users"),
    criteria: v.record(v.string(), v.number()),
    privateNote: v.optional(v.string()),
    publicFeedback: v.optional(v.string()),
    updatedAt: v.number(),
    roundId: v.optional(v.id("judgingRounds")),
    normalizedTotal: v.optional(v.number()),
    revision: v.optional(v.number()),
  })
    .index("by_event_assignment", ["eventId", "assignmentId"])
    .index("by_event_submission", ["eventId", "submissionId"]),

  roundProjects: defineTable({
    eventId: v.id("events"),
    roundId: v.id("judgingRounds"),
    submissionId: v.id("submissions"),
    versionId: v.id("submissionVersions"),
  }).index("by_eventId_and_roundId_and_submissionId", [
    "eventId",
    "roundId",
    "submissionId",
  ]),
  judgingResults: defineTable({
    eventId: v.id("events"),
    roundId: v.id("judgingRounds"),
    submissionId: v.id("submissions"),
    title: v.string(),
    summary: v.string(),
    teamName: v.string(),
    score: v.number(),
    tieScore: v.number(),
    tieTime: v.number(),
    reviews: v.number(),
    abstentions: v.number(),
    pending: v.number(),
    eligible: v.boolean(),
    rank: v.optional(v.number()),
    publicFeedback: v.array(v.string()),
  })
    .index("by_eventId_and_roundId_and_submissionId", [
      "eventId",
      "roundId",
      "submissionId",
    ])
    .index("by_eventId_roundId_eligible_score_tieScore_tieTime", [
      "eventId",
      "roundId",
      "eligible",
      "score",
      "tieScore",
      "tieTime",
    ])
    .index("by_eventId_and_roundId_and_eligible_and_rank", [
      "eventId",
      "roundId",
      "eligible",
      "rank",
    ]),

  // ── Contenido ──────────────────────────────────────
  resources: defineTable({
    eventId: v.id("events"),
    title: v.string(),
    kind: v.union(v.literal("link"), v.literal("file"), v.literal("markdown")),
    url: v.optional(v.string()),
    fileId: v.optional(v.id("_storage")),
    body: v.optional(v.string()),
    featuredFrom: v.optional(v.string()),
    visibility: v.union(
      v.literal("public"),
      v.literal("registered"),
      v.literal("approved"),
      v.literal("staff"),
    ),
    order: v.number(),
  }).index("by_event", ["eventId"]),

  mentors: defineTable({
    eventId: v.id("events"),
    userId: v.optional(v.id("users")),
    name: v.string(),
    expertise: v.array(v.string()),
    contact: v.optional(v.string()),
    publicContact: v.optional(v.boolean()),
    availability: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
  }).index("by_event", ["eventId"]),

  mentorSlots: defineTable({
    eventId: v.id("events"),
    mentorId: v.id("mentors"),
    startsAt: v.number(),
    endsAt: v.number(),
    capacity: v.number(),
    meetingUrl: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_event_and_startsAt", ["eventId", "startsAt"])
    .index("by_mentor_and_startsAt", ["mentorId", "startsAt"]),

  mentorBookings: defineTable({
    eventId: v.id("events"),
    slotId: v.id("mentorSlots"),
    mentorId: v.id("mentors"),
    teamId: v.id("teams"),
    bookedBy: v.id("users"),
    status: v.union(
      v.literal("booked"),
      v.literal("cancelled"),
      v.literal("no_show"),
      v.literal("completed"),
    ),
    bookedAt: v.number(),
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id("users")),
    cancellationReason: v.optional(v.string()),
    attendanceMarkedAt: v.optional(v.number()),
    attendanceMarkedBy: v.optional(v.id("users")),
  })
    .index("by_event_and_team", ["eventId", "teamId"])
    .index("by_slot_and_status", ["slotId", "status"])
    .index("by_slot_and_team", ["slotId", "teamId"]),

  announcements: defineTable({
    eventId: v.id("events"),
    authorId: v.id("users"),
    title: v.string(),
    body: v.string(),
    audience: v.string(),
    pinned: v.boolean(),
  }).index("by_event", ["eventId"]),

  // ── Correo ─────────────────────────────────────────
  emailCampaigns: defineTable({
    eventId: v.id("events"),
    authorId: v.id("users"),
    subject: v.string(),
    bodyMarkdown: v.string(),
    audience,
    category: v.union(v.literal("transactional"), v.literal("announcement")),
    status: v.union(
      v.literal("draft"),
      v.literal("preparing"),
      v.literal("cancelled"),
      v.literal("scheduled"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    audienceFrozen: v.optional(v.boolean()),
    workflowId: v.optional(v.string()),
    error: v.optional(v.string()),
    frozenAt: v.optional(v.number()),
    scheduledAt: v.optional(v.number()),
    recipientCount: v.optional(v.number()),
  }).index("by_event", ["eventId"]),

  emailRecipients: defineTable({
    eventId: v.id("events"),
    campaignId: v.id("emailCampaigns"),
    userId: v.id("users"),
    email: v.string(),
    resendEmailId: v.optional(v.string()),
    name: v.optional(v.string()),
    teamName: v.optional(v.string()),
    isTest: v.optional(v.boolean()),
    unsubscribeHash: v.optional(v.string()),
    developmentBody: v.optional(v.string()),
    developmentSubject: v.optional(v.string()),
    error: v.optional(v.string()),
    status: deliveryStatus,
  })
    .index("by_event_campaign", ["eventId", "campaignId"])
    .index("by_resend_id", ["resendEmailId"])
    .index("by_campaignId_and_userId_and_isTest", [
      "campaignId",
      "userId",
      "isTest",
    ])
    .index("by_unsubscribeHash", ["unsubscribeHash"]),

  emailSuppressions: defineTable({
    email: v.string(),
    reason: v.string(),
    sourceDeliveryId: v.optional(v.id("emailDeliveries")),
    updatedAt: v.optional(v.number()),
  }).index("by_email", ["email"]),

  emailDeliveries: defineTable({
    sourceKey: v.string(),
    userId: v.id("users"),
    eventId: v.optional(v.id("events")),
    verificationId: v.optional(v.id("emailVerifications")),
    notificationId: v.optional(v.id("registrationNotifications")),
    recipientId: v.optional(v.id("emailRecipients")),
    mailId: v.optional(v.id("eventMail")),
    error: v.optional(v.string()),
    email: v.string(),
    componentEmailId: v.optional(v.string()),
    providerEmailId: v.optional(v.string()),
    status: deliveryStatus,
    updatedAt: v.number(),
  })
    .index("by_sourceKey", ["sourceKey"])
    .index("by_componentEmailId", ["componentEmailId"])
    .index("by_userId", ["userId"])
    .index("by_eventId", ["eventId"]),

  eventMail: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    email: v.string(),
    subject: v.string(),
    body: v.string(),
    inviteId: v.optional(v.id("staffInvites")),
    deliveryStatus: v.optional(deliveryStatus),
    visibleToRecipient: v.boolean(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_userId", ["userId"]),
  eventEmailPreferences: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    optedOut: v.boolean(),
  })
    .index("by_eventId_and_userId", ["eventId", "userId"])
    .index("by_userId", ["userId"]),

  // ── Auditoría ──────────────────────────────────────
  auditLog: defineTable({
    actorId: v.id("users"),
    eventId: v.optional(v.id("events")),
    action: v.string(),
    targetTable: v.optional(v.string()),
    targetId: v.optional(v.string()),
    data: v.optional(v.record(v.string(), answer)),
    at: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_actor", ["actorId"]),
});
