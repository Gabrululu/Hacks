import { ImageResponse } from "@vercel/og";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

export const config = { runtime: "edge" };

const color = (candidate: string | undefined, fallback: string) =>
  candidate && /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;

function allowedImage(url: string | undefined) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      (parsed.hostname.endsWith(".convex.cloud") || parsed.hostname.endsWith(".convex.site"))
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  let event: Awaited<ReturnType<ConvexHttpClient["query"]>> | null = null;
  if (slug && /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
    const address = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
    if (!address) return new Response("Convex is not configured", { status: 503 });
    try {
      const client = new ConvexHttpClient(address);
      event = await client.query(api.events.get, { slug });
    } catch (error) {
      console.error("Unable to render event share image", error);
      return new Response("Unable to load event", { status: 503 });
    }
    if (!event) return new Response("Event not found", { status: 404 });
  }

  const page = event as { name?: string; tagline?: string; theme?: { colors?: Record<string, string>; logoId?: string }; images?: Record<string, string> } | null;
  const colors = page?.theme?.colors;
  const background = color(colors?.background, "#07110c");
  const surface = color(colors?.surface, "#102019");
  const foreground = color(colors?.text, "#f4f8f5");
  const accent = color(colors?.primary, "#b7f36b");
  const title = page?.name || "Hacks";
  const description = page?.tagline || "Ideas que se construyen.";
  const logo = page?.theme?.logoId ? allowedImage(page.images?.[page.theme.logoId]) : undefined;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background, color: foreground, fontFamily: "sans-serif", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", right: -90, top: -150, width: 520, height: 520, borderRadius: 260, border: `2px solid ${accent}`, opacity: 0.22, display: "flex" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 26, fontWeight: 700, letterSpacing: 1 }}>
        {logo ? <img src={logo} width="64" height="64" style={{ objectFit: "contain", borderRadius: 12 }} /> : <span style={{ color: accent, fontSize: 54, lineHeight: 1 }}>✳</span>}
        <span>HACKS</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1000, padding: 34, background: surface, borderRadius: 28, border: `1px solid ${accent}55` }}>
        <div style={{ color: accent, fontSize: 22, fontWeight: 700, textTransform: "uppercase", letterSpacing: 4 }}>{page ? "Hackathon" : "Ideas que se construyen"}</div>
        <div style={{ fontSize: title.length > 42 ? 52 : 68, fontWeight: 800, lineHeight: 1.08 }}>{title}</div>
        <div style={{ fontSize: 29, lineHeight: 1.3, opacity: 0.84 }}>{description}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: accent, fontSize: 21, fontWeight: 700 }}>
        <span>hacks.mintedinpe.com</span><span>BUILD SOMETHING THAT MATTERS</span>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
