import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const options = httpAction(
  async () => new Response(null, { status: 204, headers: cors }),
);

export const upload = httpAction(async (ctx, request) => {
  let fileId: Id<"_storage"> | undefined;
  try {
    const slug = new URL(request.url).searchParams.get("slug") ?? "";
    await ctx.runQuery(internal.socialCards.authorizePhotoUpload, { slug });
    const blob = await request.blob();
    if (
      !blob.size ||
      blob.size > 5 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(blob.type)
    )
      return new Response("Imagen inválida", { status: 400, headers: cors });
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer()),
      signature = String.fromCharCode(...bytes);
    if (
      (blob.type === "image/png" &&
        ![137, 80, 78, 71, 13, 10, 26, 10].every(
          (value, index) => bytes[index] === value,
        )) ||
      (blob.type === "image/jpeg" &&
        !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) ||
      (blob.type === "image/webp" &&
        !(signature.startsWith("RIFF") && signature.slice(8, 12) === "WEBP"))
    )
      return new Response("Formato inválido", { status: 400, headers: cors });
    fileId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.socialCards.registerPhotoUpload, {
      slug,
      fileId,
      contentType: blob.type,
    });
    return Response.json({ fileId }, { headers: cors });
  } catch {
    if (fileId) await ctx.storage.delete(fileId);
    return new Response(
      "No se pudo subir la foto. Revisa tu sesión y elegibilidad.",
      { status: 403, headers: cors },
    );
  }
});
