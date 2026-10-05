import { useI18n, formatLocale } from "../../i18n/I18n";
import { useEffect, useState } from "react";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Answers } from "../../../convex/lib/formEngine";
import { FormFields } from "../registration/FormFields";
import { Button } from "../../components/ui/button";
import { ProjectSocialCardDialog } from "../cards/ProjectSocialCardDialog";
import {
  useProjectOperation,
  useProjectUpload,
  useClock,
  PROJECT_STATUS,
  ProjectAnswers,
  PrivateImage,
} from "./shared";
type Workspace = FunctionReturnType<typeof api.projects.workspace>;
export function ProjectEditor({
  teamId,
  slug,
}: {
  teamId: Id<"teams">;
  slug: string;
}) {
  const { t: tr } = useI18n();

  const data = useQuery(api.projects.workspace, { teamId });
  return data ? (
    <Editor teamId={teamId} slug={slug} data={data} />
  ) : (
    <p>{tr("Cargando proyecto…")}</p>
  );
}
function Editor({
  teamId,
  slug,
  data,
}: {
  teamId: Id<"teams">;
  slug: string;
  data: Workspace;
}) {
  const { t: tr } = useI18n();

  const p = data.project,
    [title, setTitle] = useState(p?.title ?? ""),
    [summary, setSummary] = useState(p?.summary ?? ""),
    [tracks, setTracks] = useState<Id<"tracks">[]>(p?.trackIds ?? []),
    [repoUrl, setRepo] = useState(p?.repoUrl ?? ""),
    [demoUrl, setDemo] = useState(p?.demoUrl ?? ""),
    [videoUrl, setVideo] = useState(p?.videoUrl ?? ""),
    [contractId, setContract] = useState(p?.contractId ?? ""),
    [images, setImages] = useState<Id<"_storage">[]>(p?.imageIds ?? []),
    [projectLogoId, setProjectLogoId] = useState<Id<"_storage"> | "">(
      p?.projectLogoId ?? "",
    ),
    [answers, setAnswers] = useState<Answers>(p?.answers ?? {}),
    [revision, setRevision] = useState(p?.revision ?? 0),
    [uploading, setUploading] = useState<Record<string, boolean>>({}),
    save = useMutation(api.projects.save),
    submit = useMutation(api.projects.submit),
    setProjectLogo = useMutation(api.socialCards.setProjectLogo),
    upload = useProjectUpload(),
    op = useProjectOperation(),
    now = useClock();
  useEffect(() => setProjectLogoId(p?.projectLogoId ?? ""), [p?.projectLogoId]);
  const cardSettings = useQuery(api.socialCards.my, { slug });
  const [showCard, setShowCard] = useState(false);
  const closed = now < data.startsAt || now >= data.closesAt,
    stale = (p?.revision ?? 0) !== revision,
    busy = op.busy || Object.values(uploading).some(Boolean),
    formId = data.formId,
    canSubmit = now >= data.opensAt && !closed;
  const reload = () => {
    setTitle(p?.title ?? "");
    setSummary(p?.summary ?? "");
    setTracks(p?.trackIds ?? []);
    setRepo(p?.repoUrl ?? "");
    setDemo(p?.demoUrl ?? "");
    setVideo(p?.videoUrl ?? "");
    setContract(p?.contractId ?? "");
    setImages(p?.imageIds ?? []);
    setAnswers(p?.answers ?? {});
    setRevision(p?.revision ?? 0);
  };
  const persist = async (final: boolean) => {
    const id = await save({
      teamId,
      expectedRevision: revision,
      title,
      summary,
      trackIds: tracks,
      repoUrl: repoUrl || undefined,
      demoUrl: demoUrl || undefined,
      videoUrl: videoUrl || undefined,
      contractId: contractId || undefined,
      imageIds: images,
      answers,
    });
    if ((projectLogoId || null) !== (p?.projectLogoId ?? null))
      await setProjectLogo({ submissionId: id, logoId: projectLogoId || null });
    setRevision(revision + 1);
    if (final) {
      await submit({ id, expectedRevision: revision + 1 });
      setRevision(revision + 2);
    }
  };
  return (
    <div className="profile-panel project-editor">
      <div className="manage-title">
        <h3>{tr("Tu proyecto")}</h3>
        <span className="manage-badge">
          {p ? tr(PROJECT_STATUS[p.status]) : tr("Sin borrador")}
        </span>
      </div>
      <p>
        {tr("Entrega hasta ")}
        {new Date(data.closesAt).toLocaleString(formatLocale())}
        {tr(". Equipo de")} {data.teamSizeMin}–{data.teamSizeMax}{" "}
        {tr(" integrantes;")} {data.requiredCheckpoints}{" "}
        {tr(" checkpoints aceptados requeridos.")}
      </p>
      <p>
        {tr(
          "Guardar conserva un borrador. Entregar envía una versión a revisión y cierra los cambios de integrantes y checkpoints.",
        )}
      </p>
      {!canSubmit && !closed && (
        <p>
          {tr("Las entregas abren el ")}
          {new Date(data.opensAt).toLocaleString(formatLocale())}.
        </p>
      )}
      {closed && (
        <p className="profile-notice">
          {tr("La edición no está disponible fuera del período del evento.")}
        </p>
      )}
      {p?.reviewReason && (
        <p className="profile-notice">
          {tr("Revisión: ")}
          {p.reviewReason}
        </p>
      )}
      {p &&
        ["submitted", "admitted"].includes(p.status) &&
        cardSettings?.settings?.enabled && (
          <div className="project-share-card">
            <p>
              {tr(
                "Puedes preparar y descargar una card para compartir este proyecto. La publicación en la galería queda sujeta a los resultados y ajustes del evento.",
              )}
            </p>
            <Button
              className="button-secondary"
              onClick={() => setShowCard(true)}
            >
              {tr("Crear card del proyecto")}
            </Button>
            {showCard && (
              <ProjectSocialCardDialog
                slug={slug}
                submissionId={p.id}
                privateMode
                onClose={() => setShowCard(false)}
              />
            )}
          </div>
        )}
      {stale && (
        <p role="status">
          {tr("El proyecto cambió en otra sesión. Recarga antes de guardar.")}
        </p>
      )}
      <Button className="manage-outline" disabled={busy} onClick={reload}>
        {tr("Recargar proyecto guardado")}
      </Button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void op.run(
            () => persist(true),
            "Proyecto entregado. Se guardó una nueva versión.",
          );
        }}
      >
        <fieldset disabled={closed || busy || stale}>
          <label>
            {tr("Título del proyecto")}
            <input
              aria-label={tr("Título del proyecto")}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            {tr("Resumen")}
            <textarea
              aria-label={tr("Resumen del proyecto")}
              rows={5}
              maxLength={10000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <div className="project-track-picker">
            <p>{tr("Tracks")}</p>
            {data.tracks.map((t) => (
              <label className="checkbox-row" key={t.id}>
                <input
                  type="checkbox"
                  checked={tracks.includes(t.id)}
                  onChange={(e) =>
                    setTracks((old) =>
                      e.target.checked
                        ? [...old, t.id]
                        : old.filter((id) => id !== t.id),
                    )
                  }
                />
                {t.name}
              </label>
            ))}
          </div>
          {[
            ["Repositorio HTTPS", repoUrl, setRepo],
            ["Demo HTTPS", demoUrl, setDemo],
            ["Video HTTPS", videoUrl, setVideo],
            ["Contrato Stellar (C…)", contractId, setContract],
          ].map(([label, value, set]) => (
            <label key={label as string}>
              {label as string}
              <input
                aria-label={label as string}
                value={value as string}
                maxLength={2000}
                onChange={(e) => (set as (s: string) => void)(e.target.value)}
              />
            </label>
          ))}
          <label>
            {tr("Imágenes del proyecto · máximo 6, hasta 5 MB cada una")}
            <input
              aria-label={tr("Imágenes del proyecto")}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={images.length >= 6}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading((old) => ({ ...old, images: true }));
                void op
                  .run(async () => {
                    const id = await upload(
                      { teamId, kind: "image", fieldId: "images" },
                      file,
                    );
                    setImages((old) => [...old, id as Id<"_storage">]);
                  }, "Imagen preparada.")
                  .finally(() =>
                    setUploading((old) => ({ ...old, images: false })),
                  );
                e.target.value = "";
              }}
            />
          </label>
          <div className="project-images">
            {images.map((id, i) => (
              <div key={id}>
                {p?.imageIds.includes(id) && (
                  <PrivateImage id={id} source={{ submissionId: p.id }} />
                )}
                <span>
                  {tr("Imagen ")}
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setImages((old) => old.filter((x) => x !== id));
                    if (projectLogoId === id) setProjectLogoId("");
                  }}
                >
                  {tr("Quitar imagen ")}
                  {i + 1}
                </button>
              </div>
            ))}
          </div>
          <label>
            {tr("Logo para la card del proyecto")}
            <select
              aria-label={tr("Logo para la card del proyecto")}
              value={projectLogoId}
              onChange={(e) =>
                setProjectLogoId(e.target.value as Id<"_storage"> | "")
              }
            >
              <option value="">{tr("Usar inicial del proyecto")}</option>
              {images.map((id, index) => (
                <option key={id} value={id}>
                  {tr("Imagen ")}
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
          <FormFields
            eventId={p?.eventId ?? data.eventId}
            formId={formId}
            fields={data.fields}
            answers={answers}
            onChange={setAnswers}
            onUploading={(id, busy) =>
              setUploading((old) => ({ ...old, [id]: busy }))
            }
            upload={(file, f) =>
              upload(
                {
                  teamId,
                  kind: "submission",
                  fieldId: f.id,
                  ...(formId ? { formId } : {}),
                },
                file,
              )
            }
          />
          <div className="project-actions">
            <Button
              type="button"
              className="manage-outline"
              onClick={() =>
                void op.run(() => persist(false), "Borrador guardado.")
              }
            >
              {tr("Guardar borrador")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {tr("Entregar proyecto")}
            </Button>
          </div>
        </fieldset>
      </form>
      {op.message && <p role="status">{tr(op.message)}</p>}
      <History teamId={teamId} />
    </div>
  );
}
function History({ teamId }: { teamId: Id<"teams"> }) {
  const { t: tr } = useI18n();

  const { results, status, loadMore } = usePaginatedQuery(
    api.projects.history,
    { teamId },
    { initialNumItems: 10 },
  );
  return (
    <div className="project-history">
      <h3>{tr("Historial de entregas")}</h3>
      {!results.length && <p>{tr("Todavía no hay una entrega final.")}</p>}
      {results.map((r) => (
        <details key={r.id}>
          <summary>
            {tr("Versión ")}
            {r.version} · {r.title} ·{" "}
            {new Date(r.submittedAt).toLocaleString(formatLocale())}
          </summary>
          <p>{r.summary}</p>
          <div className="project-links">
            {[
              ["Repositorio", r.repoUrl],
              ["Demo", r.demoUrl],
              ["Video", r.videoUrl],
            ].map(
              ([label, url]) =>
                url && (
                  <a
                    key={tr(String(label))}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tr(String(label))}
                  </a>
                ),
            )}
          </div>
          {r.contractId && (
            <p className="wallet-address">
              {tr("Contrato: ")}
              {r.contractId}
            </p>
          )}
          <div className="project-images">
            {r.imageIds.map((id) => (
              <PrivateImage key={id} id={id} source={{ versionId: r.id }} />
            ))}
          </div>
          <ProjectAnswers
            fields={r.fields}
            answers={r.answers}
            source={{ versionId: r.id }}
          />
        </details>
      ))}
      {status === "CanLoadMore" && (
        <Button className="manage-outline" onClick={() => loadMore(10)}>
          {tr("Más versiones")}
        </Button>
      )}
    </div>
  );
}
