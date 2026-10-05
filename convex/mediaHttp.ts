import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const options = httpAction(
  async () => new Response(null, { status: 204, headers: cors }),
);
export const upload = httpAction(async (ctx, request) => {
  let fileId: Id<"_storage"> | undefined;
  try {
    const url = new URL(request.url),
      eventId = url.searchParams.get("eventId") as Id<"events">,
      kind = url.searchParams.get("kind");
    if (kind !== "image" && kind !== "resource")
      return new Response("Tipo inválido", { status: 400, headers: cors });
    await ctx.runQuery(internal.media.authorizeUpload, { eventId, kind });
    const accepted =
      kind === "image"
        ? ["image/png", "image/jpeg", "image/webp"]
        : ["application/pdf", "text/plain", "application/zip"];
    const blob = await request.blob();
    if (
      !accepted.includes(blob.type) ||
      blob.size === 0 ||
      blob.size > (kind === "image" ? 5 : 10) * 1024 * 1024
    )
      return new Response("Archivo inválido", { status: 400, headers: cors });
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const signature = String.fromCharCode(...bytes);
    if (
      (blob.type === "image/png" &&
        !(bytes[0] === 137 && signature.slice(1, 4) === "PNG")) ||
      (blob.type === "image/jpeg" &&
        !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) ||
      (blob.type === "image/webp" &&
        !(signature.startsWith("RIFF") && signature.slice(8, 12) === "WEBP")) ||
      (blob.type === "application/pdf" && !signature.startsWith("%PDF-")) ||
      (blob.type === "application/zip" && !signature.startsWith("PK"))
    )
      return new Response("Formato inválido", { status: 400, headers: cors });
    fileId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.media.registerUpload, {
      eventId,
      kind,
      fileId,
      contentType: blob.type,
      name: decodeURIComponent(request.headers.get("X-File-Name") ?? "archivo"),
    });
    return Response.json({ fileId }, { headers: cors });
  } catch {
    if (fileId) await ctx.storage.delete(fileId);
    return new Response(
      "No se pudo subir el archivo. Revisa tu sesión y permisos.",
      { status: 403, headers: cors },
    );
  }
});
export const download = httpAction(async (ctx, request) => {
  try {
    const resourceId = new URL(request.url).searchParams.get(
      "resourceId",
    ) as Id<"resources">;
    const result = await ctx.runQuery(internal.media.download, { resourceId });
    if (!result)
      return new Response("Recurso no disponible", {
        status: 404,
        headers: cors,
      });
    const blob = await ctx.storage.get(result.fileId);
    if (!blob)
      return new Response("Archivo no disponible", {
        status: 404,
        headers: cors,
      });
    return new Response(blob, {
      headers: {
        ...cors,
        "Content-Type": blob.type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Recurso no disponible", {
      status: 404,
      headers: cors,
    });
  }
});
