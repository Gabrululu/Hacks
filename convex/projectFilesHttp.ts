import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition",
};
export const options = httpAction(
  async () => new Response(null, { status: 204, headers: cors }),
);
export const upload = httpAction(async (ctx, request) => {
  let fileId: Id<"_storage"> | undefined;
  try {
    const u = new URL(request.url),
      teamId = u.searchParams.get("teamId") as Id<"teams">,
      kind = u.searchParams.get("kind") as
        "image" | "submission" | "checkpoint",
      fieldId = u.searchParams.get("fieldId") ?? "",
      formId = (u.searchParams.get("formId") || undefined) as
        Id<"forms"> | undefined,
      checkpointId = (u.searchParams.get("checkpointId") || undefined) as
        Id<"checkpoints"> | undefined;
    const input = { teamId, kind, fieldId, formId, checkpointId };
    const limits = await ctx.runQuery(internal.projectFiles.authorizeUpload, {
      ...input,
      now: Date.now(),
    });
    const blob = await request.blob();
    if (
      !blob.size ||
      blob.size > limits.maxMB * 1024 * 1024 ||
      !limits.accept.includes(blob.type)
    )
      return new Response("Archivo inválido", { status: 400, headers: cors });
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer()),
      signature = String.fromCharCode(...bytes);
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
    await ctx.runMutation(internal.projectFiles.registerUpload, {
      ...input,
      fileId,
      contentType: blob.type,
      name: decodeURIComponent(request.headers.get("X-File-Name") ?? "archivo"),
    });
    return Response.json({ fileId }, { headers: cors });
  } catch {
    if (fileId) await ctx.storage.delete(fileId);
    return new Response(
      "No se pudo cargar. Revisa la sesión, el formulario y las fechas.",
      { status: 403, headers: cors },
    );
  }
});
export const download = httpAction(async (ctx, request) => {
  try {
    const u = new URL(request.url);
    const data = await ctx.runQuery(internal.projectFiles.download, {
      submissionId: (u.searchParams.get("submissionId") || undefined) as
        Id<"submissions"> | undefined,
      checkpointSubmissionId: (u.searchParams.get("checkpointSubmissionId") ||
        undefined) as Id<"checkpointSubmissions"> | undefined,
      versionId: (u.searchParams.get("versionId") || undefined) as
        Id<"submissionVersions"> | undefined,
      imageId: (u.searchParams.get("imageId") || undefined) as
        Id<"_storage"> | undefined,
      fieldId: u.searchParams.get("fieldId") || undefined,
    });
    if (!data)
      return new Response("Archivo no disponible", {
        status: 404,
        headers: cors,
      });
    const blob = await ctx.storage.get(data.fileId);
    if (!blob)
      return new Response("Archivo no disponible", {
        status: 404,
        headers: cors,
      });
    return new Response(blob, {
      headers: {
        ...cors,
        "Cache-Control": "no-store",
        "Content-Type": blob.type,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data.name)}`,
      },
    });
  } catch {
    return new Response("Archivo no disponible", {
      status: 404,
      headers: cors,
    });
  }
});
