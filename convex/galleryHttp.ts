import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
export const image = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const fileId = await ctx.runQuery(internal.gallery.image, {
    projectId: url.searchParams.get("projectId") ?? "",
    imageId: url.searchParams.get("imageId") ?? "",
  });
  const stored = fileId ? await ctx.storage.get(fileId) : null;
  const blob =
    stored && ["image/png", "image/jpeg", "image/webp"].includes(stored.type)
      ? stored
      : null;
  return new Response(blob ?? "No disponible", {
    status: blob ? 200 : 404,
    headers: {
      "Content-Type": blob?.type ?? "text/plain",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
});
