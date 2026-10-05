import { useI18n } from "../../i18n/I18n";
import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import { GitHubRepoCard } from "../../components/elements/github-repo-card";
import { convexSiteUrl } from "../../lib/backend";
import { eventPath } from "../../lib/eventUrls";
import type { Id } from "../../../convex/_generated/dataModel";
import { ProjectSocialCardDialog } from "../cards/ProjectSocialCardDialog";
import { PersonalCardsGallery } from "../cards/PersonalCardsGallery";
export function GalleryPage({ eventSlug }: { eventSlug?: string } = {}) {
  const { t: tr } = useI18n();

  const { slug: routeSlug = "" } = useParams();
  const slug = eventSlug ?? routeSlug;
  const { results, status, loadMore } = usePaginatedQuery(
    api.gallery.list,
    { slug },
    { initialNumItems: 20 },
  );
  const [track, setTrack] = useState("");
  const [selectedProject, setSelectedProject] =
    useState<Id<"submissions"> | null>(null);
  const tracks = [...new Set(results.flatMap((p) => p.tracks))];
  return (
    <section className="simple-page manage-page">
      <Link to={eventPath(slug)}>{tr("← Volver al evento")}</Link>
      <div className="eyebrow">{tr("IDEAS QUE SE CONSTRUYEN")}</div>
      <h1>{tr("Galería de proyectos.")}</h1>
      <p>
        {tr(
          "Conoce los proyectos admitidos y a los equipos que los hicieron posibles.",
        )}
      </p>
      <label>
        {tr("Filtrar proyectos cargados por track")}
        <select value={track} onChange={(e) => setTrack(e.target.value)}>
          <option value="">{tr("Todos los tracks")}</option>
          {tracks.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <div className="gallery-projects">
        {results
          .filter((p) => !track || p.tracks.includes(track))
          .map((p) => (
            <article key={p.id}>
              {p.imageIds[0] && convexSiteUrl && (
                <img
                  className="gallery-cover"
                  loading="lazy"
                  alt={tr("Proyecto {0}", { "0": p.title })}
                  src={`${convexSiteUrl}/gallery-image?projectId=${p.id}&imageId=${p.imageIds[0]}`}
                />
              )}
              <div className="tags">
                {p.tracks.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <h2>{p.title}</h2>
              <p className="eyebrow">{p.team}</p>
              <p className="gallery-summary">{p.summary}</p>
              <Button
                className="button-secondary"
                onClick={() => setSelectedProject(p.id)}
              >
                {tr("Ver y compartir card")}
              </Button>
              <div className="admin-actions">
                {[
                  ["Demo", p.demoUrl],
                  ["Video", p.videoUrl],
                ].map(
                  ([name, url]) =>
                    url && (
                      <a
                        key={name}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {name} ↗
                      </a>
                    ),
                )}
              </div>
              {p.repoUrl && <GitHubRepoCard repoUrl={p.repoUrl} />}
            </article>
          ))}
      </div>
      {selectedProject && (
        <ProjectSocialCardDialog
          slug={slug}
          submissionId={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}
      <PersonalCardsGallery slug={slug} />
      {status === "LoadingFirstPage" && <p>{tr("Cargando proyectos…")}</p>}
      {status === "Exhausted" && !results.length && (
        <p>{tr("No hay proyectos públicos disponibles.")}</p>
      )}
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(20)}>
          {tr("Cargar más proyectos")}
        </Button>
      )}
    </section>
  );
}
