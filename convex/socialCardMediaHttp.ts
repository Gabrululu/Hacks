import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'",
};

export const options = httpAction(
  async () => new Response(null, { status: 204, headers }),
);

async function respond(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  fileId: Id<"_storage"> | null,
) {
  const blob = fileId ? await ctx.storage.get(fileId) : null;
  const image =
    blob && ["image/png", "image/jpeg", "image/webp"].includes(blob.type)
      ? blob
      : null;
  return new Response(image ?? "No disponible", {
    status: image ? 200 : 404,
    headers: { ...headers, "Content-Type": image?.type ?? "text/plain" },
  });
}

export const personalPhoto = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  let fileId: Id<"_storage"> | null = null;
  try {
    fileId = await ctx.runQuery(internal.socialCards.fileForPersonalCard, {
      slug: url.searchParams.get("slug") ?? "",
      userId: (url.searchParams.get("userId") ?? "") as Id<"users">,
    });
  } catch {
    fileId = null;
  }
  return respond(ctx, fileId);
});

export const projectLogo = httpAction(async (ctx, request) => {
  let fileId: Id<"_storage"> | null = null;
  try {
    fileId = await ctx.runQuery(internal.socialCards.fileForPublicProject, {
      submissionId: (new URL(request.url).searchParams.get("submissionId") ??
        "") as Id<"submissions">,
    });
  } catch {
    fileId = null;
  }
  return respond(ctx, fileId);
});

export const officialLogo = httpAction(async (ctx, request) => {
  let fileId: Id<"_storage"> | null = null;
  try {
    fileId = await ctx.runQuery(internal.socialCards.fileForOfficialLogo, {
      slug: new URL(request.url).searchParams.get("slug") ?? "",
    });
  } catch {
    fileId = null;
  }
  return respond(ctx, fileId);
});
