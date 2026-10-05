export const EVENT_DOMAIN_BASE = "hacks.mintedinpe.com";

export function eventDomainSlug(hostname = window.location.hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const suffix = `.${EVENT_DOMAIN_BASE}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  return label && !label.includes(".") ? label : null;
}

export function eventPath(slug: string, suffix = "") {
  const cleanSuffix = suffix.replace(/^\/+/, "");
  if (eventDomainSlug()) return cleanSuffix ? `/${cleanSuffix}` : "/";
  return `/e/${encodeURIComponent(slug)}${cleanSuffix ? `/${cleanSuffix}` : ""}`;
}

export function eventDomainUrl(domainSlug: string) {
  return `https://${domainSlug}.${EVENT_DOMAIN_BASE}`;
}

export function platformPath(path: string) {
  return eventDomainSlug() ? `https://${EVENT_DOMAIN_BASE}${path}` : path;
}
