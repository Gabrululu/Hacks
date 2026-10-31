import { eventRefForUrl, fetchPublicEvent, renderEventShareHtml } from "../src/lib/sharePreview";
import { renderEventImage } from "./og";

// Minimal Workers runtime types; the app's tsconfig uses DOM typings, which
// conflict with @cloudflare/workers-types.
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CONVEX_URL?: string;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const crawler = /bot|crawler|spider|crawling|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|pinterest|redditbot/i;

// Workers do not sit behind the CDN cache, so expensive renders are cached
// explicitly using each response's s-maxage.
async function cached(request: Request, ctx: ExecutionContext, render: () => Promise<Response>) {
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await render();
  if (response.ok) ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/api/og")
      return cached(request, ctx, () => renderEventImage(url, env.CONVEX_URL));

    if (crawler.test(request.headers.get("user-agent") || "")) {
      const ref = eventRefForUrl(url);
      const event = ref && (await fetchPublicEvent(ref, env.CONVEX_URL));
      if (event)
        return new Response(renderEventShareHtml(event, url), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
            "x-content-type-options": "nosniff",
          },
        });
    }

    return env.ASSETS.fetch(request);
  },
};
