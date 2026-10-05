// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { DEFAULT_RULES } from "./lib/formEngine";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.useRealTimers());

async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  rateLimiterTest.register(t);
  for (const name of ["events", "registrations", "submissions", "emailDeliveries"])
    aggregateTest.register(t, `${name}Metrics`);
  const { sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      wallet: "GTEST",
      tokenIdentifier: "test|organizer",
      platformRole: "organizer",
      name: "Organizador",
      emailVerifiedAt: Date.now(),
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      tokenHash: "organizer-session",
      network: "testnet",
      expiresAt: Date.now() + 86_400_000,
    });
    return { sessionId };
  });
  const identity = t.withIdentity({
    issuer: "test",
    subject: "organizer",
    tokenIdentifier: "test|organizer",
    sessionId,
  });
  const eventId = await identity.mutation(api.manage.create, {
    name: "Hack pública",
    slug: "hack-publica",
    type: "hackathon",
    timezone: "America/Lima",
  });
  return { t, identity, eventId };
}

function request(method: string, params: unknown = {}, id = 1) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  };
}

test("per-event MCP has a valid initialize handshake and only read-only tools", async () => {
  const { t } = await setup();
  const response = await t.fetch("/mcp/hack-publica", request("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  }));
  expect(response.status).toBe(200);
  const initialized = await response.json();
  expect(initialized.result.protocolVersion).toBe("2025-03-26");
  expect(initialized.result.capabilities.tools).toBeDefined();

  const toolsResponse = await t.fetch("/mcp/hack-publica", request("tools/list"));
  const listed = await toolsResponse.json();
  expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
    "event_overview",
    "event_rules",
    "event_schedule",
    "event_tracks_and_prizes",
    "event_resources",
    "event_mentors",
    "published_projects",
  ]);
  expect(listed.result.tools.some((tool: { name: string }) => /register|booking|review|write/i.test(tool.name))).toBe(false);
});

test("MCP hides draft events and serves only public page content after publishing", async () => {
  const { t, identity, eventId } = await setup();
  const draftCall = await t.fetch("/mcp/hack-publica", request("tools/call", {
    name: "event_overview",
    arguments: {},
  }));
  const draftResult = await draftCall.json();
  expect(draftResult.result.isError).toBe(true);
  expect(JSON.stringify(draftResult)).not.toContain("ownerId");

  await identity.mutation(api.content.saveBlocks, {
    eventId,
    expectedVersion: 0,
    blocks: [
      { id: "hero", type: "hero", visible: true, content: { title: "Hack pública" } },
      { id: "rules", type: "rules", visible: true, content: { title: "Bases", markdown: DEFAULT_RULES } },
      { id: "hidden", type: "about", visible: false, content: { markdown: "INTERNAL_SECRET" } },
    ],
  });
  await identity.mutation(api.content.status, { eventId, status: "published" });
  await t.run(async (ctx) => {
    await ctx.db.insert("resources", {
      eventId,
      title: "Guía pública",
      kind: "link",
      url: "https://example.org/guia",
      visibility: "public",
      order: 0,
    });
    await ctx.db.insert("resources", {
      eventId,
      title: "PRIVATE_REGISTRANT_GUIDE",
      kind: "markdown",
      body: "PRIVATE_REGISTRANT_BODY",
      visibility: "registered",
      order: 1,
    });
  });

  const overview = await t.fetch("/mcp/hack-publica", request("tools/call", {
    name: "event_overview",
    arguments: {},
  }));
  const overviewJson = await overview.json();
  expect(JSON.stringify(overviewJson)).toContain("Hack pública");
  expect(JSON.stringify(overviewJson)).not.toContain("INTERNAL_SECRET");
  expect(JSON.stringify(overviewJson)).not.toContain("GTEST");

  const rules = await t.fetch("/mcp/hack-publica", request("tools/call", {
    name: "event_rules",
    arguments: {},
  }));
  expect(JSON.stringify(await rules.json())).toContain("Bases");
  const resources = await t.fetch("/mcp/hack-publica", request("tools/call", {
    name: "event_resources",
    arguments: {},
  }));
  const resourceJson = JSON.stringify(await resources.json());
  expect(resourceJson).toContain("Guía pública");
  expect(resourceJson).not.toContain("PRIVATE_REGISTRANT");
  expect(resourceJson).not.toContain("PRIVATE_REGISTRANT_BODY");
});

test("MCP rejects invalid slugs and does not expose unpublished projects", async () => {
  const { t } = await setup();
  expect((await t.fetch("/mcp/../secret", request("tools/list"))).status).toBe(404);
  const projects = await t.fetch("/mcp/hack-publica", request("tools/call", {
    name: "published_projects",
    arguments: {},
  }));
  const projectResult = await projects.json();
  expect(projectResult.result.content[0].text).toContain('"projects": []');
});
