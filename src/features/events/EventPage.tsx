import { useI18n, formatLocale } from "../../i18n/I18n";
import { EventAnnouncements } from "../communication/EventCommunication";
import { PublishedResults } from "../judging/PublishedResults";
import { useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { api } from "../../../convex/_generated/api";
import {
  BLOCKS,
  PHASES,
  PHASE_LABELS,
  visibleBlock,
  safeUrl,
} from "../../../convex/lib/presentation";
import { useWalletAuth } from "../auth/AuthProvider";
import { downloadFile } from "../content/files";
import { eventPath } from "../../lib/eventUrls";
import { WaterRippleBackground } from "./WaterRippleBackground";
export type PageData = NonNullable<FunctionReturnType<typeof api.events.get>>;
export function Markdown({ children }: { children: string }) {
  const { t: tr } = useI18n();

  return (
    <div className="event-markdown">
      <ReactMarkdown
        skipHtml
        rehypePlugins={[rehypeSanitize]}
        urlTransform={(url) => (safeUrl(url) ? url : "")}
        components={{
          img: () => null,
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
const DATE_LABELS: Record<string, string> = {
  registrationOpensAt: "Apertura de registro",
  registrationClosesAt: "Cierre de registro",
  startsAt: "Inicio del evento",
  submissionOpensAt: "Apertura de entregas",
  submissionClosesAt: "Cierre de entregas",
  judgingClosesAt: "Cierre de evaluación",
  resultsAt: "Resultados",
};
export function EventPage({
  data,
  preview = false,
  phase,
}: {
  data: PageData;
  preview?: boolean;
  phase?: string;
}) {
  const { t: tr } = useI18n();

  const auth = useWalletAuth(),
    { isAuthenticated } = useConvexAuth();
  const viewerResources = useQuery(
    api.content.viewerResources,
    !preview && isAuthenticated ? { slug: data.slug } : "skip",
  );
  const registration = useQuery(
    api.forms.registration,
    preview ? "skip" : { slug: data.slug },
  );
  const mine = useQuery(
    api.registrations.mine,
    !preview && isAuthenticated ? { slug: data.slug } : "skip",
  );
  const registrationLink = mine
    ? eventPath(data.slug, "dashboard")
    : eventPath(data.slug, "register");
  const registrationLabel = mine ? "Ver mi inscripción" : "Inscribirme";
  const resources = viewerResources ?? data.resources;
  const [error, setError] = useState("");
  const t = data.theme,
    hasWaterBackground = Boolean(
      t.cursorEffect?.enabled && t.bannerId && data.images[t.bannerId],
    ),
    style = {
      ...Object.fromEntries(
        Object.entries(t.colors).map(([key, value]) => [
          `--event-${key}`,
          value,
        ]),
      ),
      "--event-gutter": "clamp(20px, 6vw, 90px)",
      "--event-heading": `"${t.fonts.heading}", sans-serif`,
      "--event-body": `"${t.fonts.body}", sans-serif`,
      "--event-radius": {
        none: "0px",
        sm: "4px",
        md: "12px",
        lg: "24px",
        full: "40px",
      }[t.radius],
    } as CSSProperties;
  const currentPhase = phase ?? data.phase;
  return (
    <article
      className={`event-page event-${t.mode}`}
      style={style}
      data-event-slug={data.slug}
    >
      <link
        rel="stylesheet"
        href={`https://fonts.googleapis.com/css2?family=${t.fonts.heading.replaceAll(" ", "+")}:wght@400;500;600;700&family=${t.fonts.body.replaceAll(" ", "+")}:wght@400;500;600;700&display=swap`}
      />
      {preview && (
        <div className="preview-banner">
          {tr("VISTA PREVIA · Sin publicar cambios pendientes")}
        </div>
      )}
      <div className="event-topline">
        <Link to="/">{tr("← Explorar eventos")}</Link>
        <span>
          {tr(PHASE_LABELS[PHASES.indexOf(currentPhase)] ?? "Próximamente")}
        </span>
      </div>
      {t.logoId && data.images[t.logoId] && (
        <img
          className="event-logo"
          src={data.images[t.logoId]}
          alt={tr("Logo de {0}", { "0": data.name })}
        />
      )}
      {!hasWaterBackground && t.bannerId && data.images[t.bannerId] && (
        <img
          className="event-banner"
          src={data.images[t.bannerId]}
          alt={tr("Banner de {0}", { "0": data.name })}
        />
      )}
      {!preview && (
        <div className="event-registration-bar">
          <span>
            {mine
              ? tr("Tu inscripción está lista para consultar.")
              : registration?.registrationOpen
                ? tr("Registro abierto")
                : tr("Consulta el registro del evento")}
          </span>
          <Link className="event-button" to={registrationLink}>
            {registrationLabel}
          </Link>
        </div>
      )}
      {data.blocks
        .filter((b) => visibleBlock(b, currentPhase))
        .map((b) => {
          const c = b.content,
            str = (key: string, fallback = "") =>
              typeof c[key] === "string" && (c[key] as string).trim()
                ? (c[key] as string)
                : fallback,
            arr = (key: string) =>
              Array.isArray(c[key]) ? (c[key] as string[]) : [];
          const title = str("title", tr(BLOCKS[b.type]?.label));
          const sectionStyle: CSSProperties = {};
          if (b.style?.backgroundColor)
            sectionStyle["--block-background" as keyof CSSProperties] =
              b.style.backgroundColor as never;
          if (b.style?.textColor)
            sectionStyle["--block-text" as keyof CSSProperties] =
              b.style.textColor as never;
          return (
            <section
              className={`event-block block-${b.type} block-width-${b.style?.width ?? "contained"} block-align-${b.style?.align ?? "left"} block-spacing-${b.style?.spacing ?? "normal"} ${b.style?.surface === "surface" ? "block-surface" : ""} ${b.style?.backgroundColor ? "block-custom-background" : ""} ${b.type === "hero" && hasWaterBackground ? "event-hero-water" : ""}`}
              key={b.id}
              data-block-id={b.id}
              style={sectionStyle}
            >
              {b.type === "hero" && hasWaterBackground && t.bannerId && (
                <WaterRippleBackground
                  src={data.images[t.bannerId]!}
                  intensity={t.cursorEffect?.intensity ?? 0.45}
                  alt={tr("Fondo de {0}", { "0": data.name })}
                />
              )}
              {b.type === "hero" ? (
                <>
                  <div className="event-eyebrow">
                    {str("eyebrow", tr("CONSTRUYE EN COMUNIDAD"))}
                  </div>
                  <h1>{str("title", data.name)}</h1>
                  <p className="event-subtitle">
                    {str("subtitle", data.tagline)}
                  </p>
                </>
              ) : (
                <h2>{title}</h2>
              )}
              {[
                "about",
                "rules",
                "custom_markdown",
                "prizes",
                "cta_register",
              ].includes(b.type) && (
                <Markdown>
                  {str("markdown", b.type === "about" ? data.description : "")}
                </Markdown>
              )}
              {b.type === "tracks" && (
                <div className="event-cards">
                  {data.tracks.map((track) => (
                    <div className="event-surface" key={track.id}>
                      <h3>{track.name}</h3>
                      <Markdown>{track.description}</Markdown>
                      {track.prize && <strong>{track.prize}</strong>}
                    </div>
                  ))}
                </div>
              )}
              {b.type === "prizes" && (
                <div className="event-cards">
                  {data.tracks
                    .filter((t) => t.prize)
                    .map((t) => (
                      <div className="event-surface" key={t.id}>
                        <h3>{t.name}</h3>
                        <strong>{t.prize}</strong>
                      </div>
                    ))}
                </div>
              )}
              {b.type === "timeline" && (
                <dl className="event-dates">
                  {Object.entries(data.timeline)
                    .sort(
                      (a, b) =>
                        a[1] - b[1] ||
                        Object.keys(DATE_LABELS).indexOf(a[0]) -
                          Object.keys(DATE_LABELS).indexOf(b[0]),
                    )
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{tr(DATE_LABELS[key] ?? key)}</dt>
                        <dd>
                          {new Intl.DateTimeFormat(formatLocale(), {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: data.timezone,
                          }).format(value)}
                        </dd>
                      </div>
                    ))}
                </dl>
              )}
              {b.type === "schedule" && (
                <div className="event-dates">
                  {arr("labels").map((label, i) => (
                    <div key={i}>
                      <strong>{arr("times")[i]}</strong>
                      <h3>{label}</h3>
                      <p>{arr("descriptions")[i]}</p>
                    </div>
                  ))}
                </div>
              )}
              {b.type === "faq" &&
                arr("questions").map((q, i) => (
                  <details className="event-surface" key={i}>
                    <summary>{q}</summary>
                    <p>{arr("answers")[i]}</p>
                  </details>
                ))}
              {b.type === "sponsors" && (
                <div className="event-cards">
                  {arr("names").map((name, i) => (
                    <div className="event-surface" key={i}>
                      {safeUrl(arr("urls")[i] ?? "") ? (
                        <a
                          href={arr("urls")[i]}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {name} ↗
                        </a>
                      ) : (
                        name
                      )}
                    </div>
                  ))}
                </div>
              )}
              {b.type === "mentors" && (
                <div className="event-cards">
                  {data.mentors.map((m, i) => (
                    <div className="event-surface" key={i}>
                      {m.photo && (
                        <img
                          className="mentor-photo"
                          src={m.photo}
                          alt={m.name}
                        />
                      )}
                      <h3>{m.name}</h3>
                      <p>{m.expertise.join(" · ")}</p>
                      <p>{m.availability}</p>
                      {m.contact && <p>{m.contact}</p>}
                    </div>
                  ))}
                </div>
              )}
              {b.type === "judges" && (
                <div className="event-cards">
                  {data.judges.map((j, i) => (
                    <div className="event-surface" key={i}>
                      <h3>{j.name}</h3>
                      <p>{j.bio}</p>
                    </div>
                  ))}
                </div>
              )}
              {b.type === "resources" && (
                <div className="event-cards">
                  {resources.map((r) => (
                    <div className="event-surface" key={r.id}>
                      {r.featuredFrom === currentPhase && (
                        <span className="event-eyebrow">{tr("DESTACADO")}</span>
                      )}
                      <h3>{r.title}</h3>
                      {r.kind === "markdown" && (
                        <Markdown>{r.body ?? ""}</Markdown>
                      )}
                      {r.kind === "link" && r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {tr("Abrir recurso ↗")}
                        </a>
                      )}
                      {r.kind === "file" && (
                        <button
                          className="event-button"
                          disabled={preview}
                          onClick={() => {
                            setError("");
                            void auth
                              .fetchAccessToken({ forceRefreshToken: false })
                              .then((token) =>
                                downloadFile(r.id, r.title, token),
                              )
                              .catch((e) => setError(String(e.message)));
                          }}
                        >
                          {tr("Descargar ")}
                          {r.title}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {b.type === "gallery" && (
                <div className="event-gallery">
                  {arr("imageIds").map((id, i) =>
                    data.images[id] ? (
                      <figure key={`${id}-${i}`}>
                        <img
                          src={data.images[id]}
                          alt={arr("captions")[i] ?? tr("Imagen del evento")}
                        />
                        <figcaption>{arr("captions")[i]}</figcaption>
                      </figure>
                    ) : null,
                  )}
                </div>
              )}
              {b.type === "cta_register" && (
                <>
                  {preview ? (
                    <button className="event-button" disabled>
                      {str("buttonLabel", tr("Participar"))}
                    </button>
                  ) : (
                    <Link className="event-button" to={registrationLink}>
                      {mine
                        ? registrationLabel
                        : str("buttonLabel", tr("Inscribirme"))}
                    </Link>
                  )}
                  <p className="event-note">
                    {preview
                      ? tr("Vista previa del acceso al registro.")
                      : tr(
                          "Necesitas tu perfil completo y un correo verificado para participar.",
                        )}
                  </p>
                </>
              )}
            </section>
          );
        })}
      {error && <p role="alert">{tr(error)}</p>}
      {!preview && <EventAnnouncements slug={data.slug} />}
      {!preview && (
        <>
          {data.publicGallery && (
            <Link className="manage-back" to={eventPath(data.slug, "projects")}>
              {tr("Explorar proyectos →")}
            </Link>
          )}
          <PublishedResults key={data.slug} slug={data.slug} />
        </>
      )}
    </article>
  );
}
export function EventMetadata({ data }: { data: PageData }) {
  useEffect(() => {
    const oldTitle = document.title;
    document.title = `${data.name} | hacks`;
    const icon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const oldIconHref = icon?.href;
    let addedIcon: HTMLLinkElement | null = null;
    const updated: { element: HTMLMetaElement; content: string | null }[] = [];
    const setMeta = (
      attribute: "property" | "name",
      key: string,
      content: string,
    ) => {
      let element = document.head.querySelector<HTMLMetaElement>(
        `meta[${attribute}="${key}"]`,
      );
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.append(element);
      }
      updated.push({ element, content: element.getAttribute("content") });
      element.content = content;
    };
    const title = `${data.name} | Hacks`;
    const description = data.tagline || data.description;
    const image = data.theme.ogImageId
      ? data.images[data.theme.ogImageId]
      : `${window.location.origin}/api/og?slug=${encodeURIComponent(data.slug)}`;
    const canonical = window.location.hostname.endsWith(".hacks.mintedinpe.com")
      ? `${window.location.origin}/`
      : `${window.location.origin}/e/${encodeURIComponent(data.slug)}`;
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonical);
    setMeta("property", "og:image", image);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);
    setMeta("name", "description", description);
    if (data.theme.faviconId && data.images[data.theme.faviconId]) {
      if (icon) icon.href = data.images[data.theme.faviconId];
      else {
        addedIcon = document.createElement("link");
        addedIcon.rel = "icon";
        addedIcon.href = data.images[data.theme.faviconId];
        document.head.append(addedIcon);
      }
    }
    return () => {
      document.title = oldTitle;
      updated.forEach(({ element, content }) => {
        if (content === null) element.remove();
        else element.content = content;
      });
      if (addedIcon) addedIcon.remove();
      else if (icon && oldIconHref) icon.href = oldIconHref;
    };
  }, [data]);
  return null;
}
export function PreviewPage({ onConnect, eventSlug }: { onConnect: () => void; eventSlug?: string }) {
  const { t: tr } = useI18n();

  const { slug: routeSlug = "" } = useParams(),
    slug = eventSlug ?? routeSlug,
    { isAuthenticated, isLoading } = useConvexAuth();
  const detail = useQuery(
    api.manage.detail,
    isAuthenticated ? { slug } : "skip",
  );
  const preview = useQuery(
    api.content.preview,
    detail ? { eventId: detail.event._id } : "skip",
  );
  const [phase, setPhase] = useState("registration");
  if (isLoading)
    return <section className="simple-page">{tr("Cargando…")}</section>;
  if (!isAuthenticated)
    return (
      <section className="simple-page">
        <h1>{tr("Vista previa privada.")}</h1>
        <button className="button" onClick={onConnect}>
          {tr("Conectar wallet")}
        </button>
      </section>
    );
  if (detail === null)
    return (
      <section className="simple-page">
        <h1>{tr("Evento no disponible.")}</h1>
      </section>
    );
  if (!preview)
    return (
      <section className="simple-page">{tr("Cargando vista previa…")}</section>
    );
  return (
    <>
      <div className="preview-toolbar">
        <Link to={eventPath(slug, "manage")}>{tr("← Volver al editor")}</Link>
        <label>
          {tr("Vista por fase")}{" "}
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            {PHASES.map((p, i) => (
              <option key={p} value={p}>
                {tr(PHASE_LABELS[i])}
              </option>
            ))}
          </select>
        </label>
      </div>
      <EventPage data={preview} preview phase={phase} />
    </>
  );
}

export function PublishedEventPage({ data }: { data: PageData }) {
  const { t: tr } = useI18n();

  return (
    <>
      <EventMetadata data={data} />
      <EventPage data={data} />
    </>
  );
}
