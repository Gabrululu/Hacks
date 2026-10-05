import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { EVENT_DOMAIN_BASE } from "./eventUrls";

type PublicEvent = NonNullable<FunctionReturnType<typeof api.events.get>>;
type EventRef = { slug: string } | { domainSlug: string };

export function eventRefForUrl(url: URL): EventRef | null {
  const path = url.pathname.match(/^\/e\/([^/]+)\/?$/);
  if (path) {
    try {
      const slug = decodeURIComponent(path[1]);
      return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ? { slug } : null;
    } catch {
      return null;
    }
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const suffix = `.${EVENT_DOMAIN_BASE}`;
  if (!host.endsWith(suffix)) return null;
  const domainSlug = host.slice(0, -suffix.length);
  return domainSlug && !domainSlug.includes(".") ? { domainSlug } : null;
}

export async function fetchPublicEvent(ref: EventRef): Promise<PublicEvent | null> {
  const address = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (!address) return null;
  try {
    const client = new ConvexHttpClient(address);
    return "slug" in ref
      ? await client.query(api.events.get, ref)
      : await client.query(api.events.getByDomain, ref);
  } catch (error) {
    console.error("Unable to load event share metadata", error);
    return null;
  }
}

export function eventCanonicalUrl(page: PublicEvent, requestUrl: URL) {
  const host = requestUrl.hostname.toLowerCase();
  const suffix = `.${EVENT_DOMAIN_BASE}`;
  const alias = host.endsWith(suffix) ? host.slice(0, -suffix.length) : "";
  if (alias && !alias.includes(".")) {
    return `https://${host}/`;
  }
  return `${requestUrl.origin}/e/${encodeURIComponent(page.slug)}`;
}

export function eventShareImage(page: PublicEvent, canonicalUrl: string) {
  const selected = page.theme.ogImageId
    ? page.images[String(page.theme.ogImageId)]
    : undefined;
  if (selected) return selected;
  const imageUrl = new URL("/api/og", canonicalUrl);
  imageUrl.searchParams.set("slug", page.slug);
  return imageUrl.toString();
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);
}

export function renderEventShareHtml(page: PublicEvent, requestUrl: URL) {
  const title = `${page.name} | Hacks`;
  const description = (page.tagline || page.description || `Participa en ${page.name}.`).slice(0, 300);
  const canonical = eventCanonicalUrl(page, requestUrl);
  const image = eventShareImage(page, canonical);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeUrl = escapeHtml(canonical);
  const safeImage = escapeHtml(image);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><meta name="description" content="${safeDescription}"><link rel="canonical" href="${safeUrl}"><meta property="og:type" content="website"><meta property="og:site_name" content="Hacks"><meta property="og:url" content="${safeUrl}"><meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeDescription}"><meta property="og:image" content="${safeImage}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${safeTitle}"><meta name="twitter:description" content="${safeDescription}"><meta name="twitter:image" content="${safeImage}"></head><body><main><h1>${safeTitle}</h1><p>${safeDescription}</p><a href="${safeUrl}">Ver evento</a></main></body></html>`;
}
