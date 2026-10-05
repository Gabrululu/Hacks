import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "../../i18n/I18n";
import { convexSiteUrl } from "../../lib/backend";
import { useWalletAuth } from "../auth/AuthProvider";
import { Button } from "../../components/ui/button";
import { SocialCardCanvas, socialCardPng } from "./SocialCardCanvas";

export function ProjectSocialCardDialog({
  slug,
  submissionId,
  onClose,
  privateMode = false,
}: {
  slug: string;
  submissionId: Id<"submissions">;
  onClose: () => void;
  privateMode?: boolean;
}) {
  const { t: tr } = useI18n();
  const privateProject = useQuery(
    api.socialCards.projectMine,
    privateMode ? { submissionId } : "skip",
  );
  const publicProject = useQuery(
    api.socialCards.project,
    privateMode ? "skip" : { slug, submissionId },
  );
  const project = privateMode ? privateProject : publicProject;
  const event = useQuery(api.events.get, { slug });
  const { fetchAccessToken } = useWalletAuth();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [privateLogoUrl, setPrivateLogoUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const baseUrl = convexSiteUrl;
    if (!privateMode || !project?.logoUrl || !baseUrl) {
      setPrivateLogoUrl(null);
      return;
    }
    void fetchAccessToken({ forceRefreshToken: false })
      .then(async (token) => {
        if (!token) return;
        const url = `${baseUrl.replace(/\/$/, "")}/${project.logoUrl!.replace(/^\//, "")}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setPrivateLogoUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => setPrivateLogoUrl(null));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [privateMode, project?.logoUrl, fetchAccessToken]);
  const palette = event?.theme.colors;
  const data = useMemo(() => {
    if (!project || !event) return null;
    const links = [
      [tr("Repositorio"), project.repoUrl],
      [tr("Demo"), project.demoUrl],
      [tr("Video"), project.videoUrl],
    ].flatMap(([label, url]) =>
      typeof url === "string" ? [{ label: label ?? "", url }] : [],
    );
    return {
      eventName: project.officialName || event.name,
      eventTagline: event.tagline,
      projectLabel: tr("PROYECTO CREADO EN"),
      templateId: project.templateId,
      palette: {
        background: palette!.background,
        surface: palette!.surface,
        text: palette!.text,
        primary: palette!.primary,
        accent: palette!.accent,
      },
      eventLogoUrl:
        project.officialLogoUrl && convexSiteUrl
          ? `${convexSiteUrl.replace(/\/$/, "")}/${project.officialLogoUrl.replace(/^\//, "")}`
          : event.theme.logoId
            ? event.images[String(event.theme.logoId)]
            : null,
      project: {
        title: project.title,
        team: project.team,
        summary: project.summary,
        logoUrl: privateMode
          ? privateLogoUrl
          : project.logoUrl && convexSiteUrl
            ? `${convexSiteUrl.replace(/\/$/, "")}/${project.logoUrl.replace(/^\//, "")}`
            : null,
        links,
      },
    };
  }, [project, event, palette, tr, privateMode, privateLogoUrl]);
  async function download() {
    if (!canvas.current) return;
    const file = await socialCardPng(
      canvas.current,
      `project-${project?.title ?? "card"}.png`,
    );
    const href = URL.createObjectURL(file),
      link = document.createElement("a");
    link.href = href;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  if (project === undefined || event === undefined)
    return <p>{tr("Cargando card del proyecto…")}</p>;
  if (!event) return null;
  if (!project || !data)
    return (
      <div className="social-card-dialog-backdrop" role="presentation">
        <section
          className="profile-panel social-card-dialog"
          role="dialog"
          aria-modal="true"
        >
          <h2>{tr("La card de este proyecto todavía no está disponible.")}</h2>
          <p>
            {tr(
              "La organización debe habilitar las cards y publicar los resultados y la galería del evento.",
            )}
          </p>
          <Button onClick={onClose}>{tr("Cerrar")}</Button>
        </section>
      </div>
    );
  const copy = project.copyText
    .replaceAll("{event}", event.name)
    .replaceAll("{project}", project.title);
  const xText = [
    copy,
    project.socialHandles.x
      ? `@${project.socialHandles.x.replace(/^@/, "")}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const linkedinCopy = [
    copy,
    project.socialHandles.linkedin
      ? `@${project.socialHandles.linkedin.replace(/^@/, "")}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  async function shareImage() {
    if (!canvas.current || !project) return;
    const file = await socialCardPng(
      canvas.current,
      `project-${project.title}.png`,
    );
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: project.title,
          text: copy,
          ...(!privateMode ? { url: window.location.href } : {}),
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setMessage(tr("No se pudo compartir la imagen."));
      }
    } else {
      await download();
    }
  }
  return (
    <div
      className="social-card-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="profile-panel social-card-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-social-title"
      >
        <button
          className="social-card-dialog-close"
          aria-label={tr("Cerrar")}
          onClick={onClose}
        >
          ×
        </button>
        <div className="eyebrow">{tr("CARD DEL PROYECTO")}</div>
        <h2 id="project-social-title">{project.title}</h2>
        <SocialCardCanvas
          data={data}
          canvasRef={canvas}
          className="social-card-preview"
        />
        <div className="admin-actions social-card-links">
          {[
            [tr("Repositorio"), project.repoUrl],
            [tr("Demo"), project.demoUrl],
            [tr("Video"), project.videoUrl],
          ].map(
            ([label, url]) =>
              url && (
                <a key={label} href={url} target="_blank" rel="noreferrer">
                  {label} ↗
                </a>
              ),
          )}
        </div>
        <div className="manage-actions">
          <Button onClick={() => void download()}>{tr("Descargar PNG")}</Button>
          <Button
            className="button-secondary"
            onClick={() => void shareImage()}
          >
            {tr("Compartir imagen")}
          </Button>
          <a
            href={`https://twitter.com/intent/tweet?${new URLSearchParams({ text: xText, ...(!privateMode ? { url: window.location.href } : {}) })}`}
            target="_blank"
            rel="noreferrer"
          >
            {tr("Compartir en X")}
          </a>
          {!privateMode && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                void navigator.clipboard.writeText(linkedinCopy).then(
                  () =>
                    setMessage(
                      tr("Copy de LinkedIn copiado; pégalo al publicar."),
                    ),
                  () =>
                    setMessage(tr("No se pudo copiar el copy de LinkedIn.")),
                );
                window.open(
                  `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
            >
              {tr("Compartir en LinkedIn")}
            </button>
          )}
        </div>
        {message && <p role="status">{message}</p>}
      </section>
    </div>
  );
}
