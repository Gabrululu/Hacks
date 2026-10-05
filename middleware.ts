import { next } from "@vercel/functions";
import { eventRefForUrl, fetchPublicEvent, renderEventShareHtml } from "./src/lib/sharePreview";

const crawler = /bot|crawler|spider|crawling|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|pinterest|redditbot/i;

export default async function middleware(request: Request) {
  const userAgent = request.headers.get("user-agent") || "";
  if (!crawler.test(userAgent)) return next();

  const url = new URL(request.url);
  const ref = eventRefForUrl(url);
  if (!ref) return next();

  const event = await fetchPublicEvent(ref);
  if (!event) return next();

  return new Response(renderEventShareHtml(event, url), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

export const config = { matcher: ["/", "/e/:path*"] };
