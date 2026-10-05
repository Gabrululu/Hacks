// Route local Convex through Vite during development so remote browsers (for
// example Codespaces) never try to connect to their own loopback address.
export function backendUrl(configured: string | undefined, path: string) {
  if (!configured) return undefined;
  const url = new URL(configured);
  if (
    import.meta.env.DEV &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    return `${window.location.origin}${path}`;
  }
  return configured;
}
export const convexUrl = backendUrl(
  import.meta.env.VITE_CONVEX_URL,
  "/__convex",
);
export const convexSiteUrl = backendUrl(
  import.meta.env.VITE_CONVEX_SITE_URL,
  "/__convex-site",
);
