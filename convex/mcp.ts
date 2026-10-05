import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import type { Infer } from "convex/values";
import { pageView } from "./lib/contentValidators";

const PROTOCOL_VERSION = "2025-03-26";
const MAX_BODY_LENGTH = 16_384;
const tools = [
  {
    name: "event_overview",
    description: "Información oficial pública del hackathon, fechas y ubicación.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "event_rules",
    description: "Bases, reglas, preguntas frecuentes y descripción publicadas del evento.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "event_schedule",
    description: "Agenda pública y fechas oficiales del evento en su zona horaria.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "event_tracks_and_prizes",
    description: "Tracks, desafíos y premios publicados.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "event_resources",
    description: "Recursos públicos publicados por la organización.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "event_mentors",
    description: "Perfiles y disponibilidad pública de mentores anunciados.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "published_projects",
    description: "Proyectos públicos, solo cuando la organización publicó resultados y galería.",
    inputSchema: {
      type: "object",
      properties: {
        cursor: { type: "string", description: "Cursor devuelto por la llamada anterior." },
      },
      additionalProperties: false,
    },
  },
];

type RpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: RpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: RpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function textResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slugFromUrl(request: Request) {
  const match = new URL(request.url).pathname.match(/^\/mcp\/([^/]+)$/);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return null;
  }
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 64
    ? slug
    : null;
}

export const handle = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("MCP Streamable HTTP uses POST for requests.", {
      status: 405,
      headers: { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const slug = slugFromUrl(request);
  if (!slug) return new Response("Invalid event MCP path.", { status: 404 });

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_LENGTH) return new Response("Request too large.", { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON-RPC request.", { status: 400 });
  }
  if (!isRecord(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return new Response("Invalid JSON-RPC request.", { status: 400 });
  }
  const rpc = body as unknown as RpcRequest;
  const notification = rpc.id === undefined;
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

  if (rpc.method === "notifications/initialized" || rpc.method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers });
  }

  let response: unknown;
  try {
    switch (rpc.method) {
      case "initialize": {
        const clientVersion = isRecord(rpc.params) && typeof rpc.params.protocolVersion === "string"
          ? rpc.params.protocolVersion
          : PROTOCOL_VERSION;
        response = rpcResult(rpc.id, {
          protocolVersion: ["2024-11-05", "2025-03-26", "2025-06-18"].includes(clientVersion)
            ? clientVersion
            : PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
          serverInfo: { name: "hacks-event-mcp", version: "1.0.0" },
          instructions: `Servidor público de solo lectura para el evento ${slug}. Solo expone información que ya es pública en la página del evento. No contiene herramientas para escribir ni acceso a cuentas de participantes.`,
        });
        break;
      }
      case "ping":
        response = rpcResult(rpc.id, {});
        break;
      case "tools/list":
        response = rpcResult(rpc.id, { tools });
        break;
      case "resources/list":
        response = rpcResult(rpc.id, {
          resources: [
            {
              uri: `hacks://events/${slug}/public-info`,
              name: "Información pública del evento",
              description: "Bases, agenda, tracks, recursos y perfiles públicos de mentores.",
              mimeType: "application/json",
            },
          ],
        });
        break;
      case "resources/read": {
        const uri = isRecord(rpc.params) ? rpc.params.uri : undefined;
        if (uri !== `hacks://events/${slug}/public-info`) {
          response = rpcError(rpc.id, -32602, "Recurso desconocido.");
          break;
        }
        const page = await ctx.runQuery(api.events.get, { slug });
        if (!page) {
          response = rpcError(rpc.id, -32004, "Evento no disponible.");
          break;
        }
        response = rpcResult(rpc.id, {
          contents: [{ uri, mimeType: "application/json", text: JSON.stringify(publicEvent(page)) }],
        });
        break;
      }
      case "tools/call": {
        const params = rpc.params;
        if (!isRecord(params) || typeof params.name !== "string") {
          response = rpcError(rpc.id, -32602, "Se requiere el nombre de una herramienta.");
          break;
        }
        const args = isRecord(params.arguments) ? params.arguments : {};
        if (Object.keys(args).some((key) => key !== "cursor")) {
          response = rpcError(rpc.id, -32602, "Argumentos no admitidos.");
          break;
        }
        if (params.name === "published_projects") {
          const cursor = typeof args.cursor === "string" ? args.cursor : null;
          const result = await ctx.runQuery(api.gallery.list, {
            slug,
            paginationOpts: { numItems: 20, cursor },
          });
          response = rpcResult(rpc.id, textResult({
            projects: result.page.map((project) => ({
              title: project.title,
              summary: project.summary,
              team: project.team,
              tracks: project.tracks,
              repoUrl: project.repoUrl,
              demoUrl: project.demoUrl,
              videoUrl: project.videoUrl,
            })),
            continueCursor: result.isDone ? null : result.continueCursor,
          }));
          break;
        }
        const page = await ctx.runQuery(api.events.get, { slug });
        if (!page) {
          response = rpcResult(rpc.id, { ...textResult({ error: "Evento no disponible o no publicado." }), isError: true });
          break;
        }
        const value = publicEvent(page);
        let content: unknown;
        switch (params.name) {
          case "event_overview": content = value.overview; break;
          case "event_rules": content = value.rules; break;
          case "event_schedule": content = value.schedule; break;
          case "event_tracks_and_prizes": content = value.tracks; break;
          case "event_resources": content = value.resources; break;
          case "event_mentors": content = value.mentors; break;
          default:
            response = rpcError(rpc.id, -32602, "Herramienta desconocida.");
            break;
        }
        if (!response) response = rpcResult(rpc.id, textResult(content));
        break;
      }
      default:
        response = rpcError(rpc.id, -32601, "Método MCP no soportado.");
    }
  } catch {
    response = rpcError(rpc.id, -32603, "No se pudo completar la consulta pública.");
  }
  if (notification) return new Response(null, { status: 202, headers });
  return new Response(JSON.stringify(response), { status: 200, headers });
});

function publicEvent(page: Infer<typeof pageView>) {
  const event = page;
  const sections = (types: string[]) => event.blocks
    .filter((block) => types.includes(block.type))
    .map((block) => ({ type: block.type, ...block.content }));
  return {
    overview: {
      slug: event.slug,
      name: event.name,
      tagline: event.tagline,
      description: event.description,
      timezone: event.timezone,
      phase: event.phase,
      dates: event.timeline,
    },
    rules: sections(["rules", "faq", "about"]),
    schedule: { timezone: event.timezone, dates: event.timeline, sections: sections(["schedule", "timeline"]) },
    tracks: event.tracks.map(({ name, description, prize }) => ({ name, description, prize })),
    resources: event.resources.map((resource) => ({
      title: resource.title,
      kind: resource.kind,
      ...(resource.url ? { url: resource.url } : {}),
      ...(resource.body ? { body: resource.body } : {}),
    })),
    mentors: event.mentors.map(({ name, expertise, availability, contact }) => ({
      name, expertise, availability, ...(contact ? { publicContact: contact } : {}),
    })),
    projectsAvailable: event.publicGallery,
  };
}
