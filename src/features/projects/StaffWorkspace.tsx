import { useI18n, formatLocale } from "../../i18n/I18n";
import { useState } from "react";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "../../components/ui/button";
import {
  useProjectOperation,
  PROJECT_STATUS,
  CHECKPOINT_STATUS,
  ProjectAnswers,
  PrivateImage,
} from "./shared";
export function TeamsStaff({
  eventId,
  readOnly,
}: {
  eventId: Id<"events">;
  readOnly: boolean;
}) {
  const { t: tr } = useI18n();

  const { results, status, loadMore } = usePaginatedQuery(
      api.teams.list,
      { eventId },
      { initialNumItems: 25 },
    ),
    [source, setSource] = useState(""),
    [target, setTarget] = useState(""),
    merge = useMutation(api.teams.mergeStaff),
    op = useProjectOperation();
  return (
    <div className="profile-panel">
      <h2>{tr("Equipos del evento")}</h2>
      <div className="manage-event-grid">
        {results.map((t) => (
          <article key={t.id} className="team-finder-card">
            <h3>{t.name}</h3>
            <p>{t.description}</p>
            <p>
              {t.memberCount} {tr(" integrantes ·")}{" "}
              {t.lookingForMembers
                ? tr("Busca integrantes")
                : tr("Equipo completo")}
            </p>
          </article>
        ))}
      </div>
      {!results.length && <p>{tr("Todavía no hay equipos.")}</p>}
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(25)}>{tr("Más equipos")}</Button>
      )}
      {!readOnly && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void op.run(async () => {
              await merge({
                eventId,
                sourceId: source as Id<"teams">,
                targetId: target as Id<"teams">,
              });
              setSource("");
              setTarget("");
            }, "Equipos fusionados.");
          }}
        >
          <h3>{tr("Fusionar equipos")}</h3>
          <p>
            {tr(
              "Todos los integrantes y checkpoints se incorporan al destino. Se conserva el borrador del destino y se cierra el equipo de origen. Solo se permite antes de la primera entrega y sin superar el tamaño máximo.",
            )}
          </p>
          {[
            ["Equipo de origen", source, setSource],
            ["Equipo de destino", target, setTarget],
          ].map(([label, value, set]) => (
            <label key={label as string}>
              {label as string}
              <select
                aria-label={label as string}
                required
                value={value as string}
                onChange={(e) => (set as (s: string) => void)(e.target.value)}
              >
                <option value="">{tr("Selecciona un equipo")}</option>
                {results.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.memberCount} {tr(" integrantes")}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <Button
            disabled={op.busy || !source || !target || source === target}
            type="submit"
          >
            {tr("Confirmar fusión de equipos")}
          </Button>
        </form>
      )}
      {op.message && <p role="status">{tr(op.message)}</p>}
    </div>
  );
}
export function CheckpointsStaff({
  event,
  permissions,
}: {
  event: Doc<"events">;
  permissions: string[];
}) {
  const { t: tr } = useI18n();

  const editable = permissions.includes("event.edit"),
    review = permissions.includes("submissions.review"),
    readOnly =
      event.status !== "published" ||
      event.judgingClosed ||
      event.resultsPublished;
  return (
    <div>
      {editable && <CheckpointDefinitions event={event} />}
      {permissions.includes("submissions.view") && (
        <CheckpointReviews
          eventId={event._id}
          canReview={review && !readOnly}
        />
      )}
    </div>
  );
}
function CheckpointDefinitions({ event }: { event: Doc<"events"> }) {
  const { t: tr } = useI18n();

  const rows = useQuery(api.checkpoints.editor, { eventId: event._id }),
    [id, setId] = useState<Id<"checkpoints">>(),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [due, setDue] = useState(""),
    [order, setOrder] = useState(0),
    [revision, setRevision] = useState(0),
    save = useMutation(api.checkpoints.save),
    remove = useMutation(api.checkpoints.remove),
    op = useProjectOperation(),
    reset = () => {
      setId(undefined);
      setTitle("");
      setDescription("");
      setDue("");
      setOrder(0);
      setRevision(0);
    };
  return (
    <div className="profile-panel">
      <h2>{tr("Definir checkpoints")}</h2>
      <p>
        {tr(
          "Publica primero el formulario de checkpoint para personalizar sus campos. Si no existe, se solicita el avance y un repositorio opcional. Los campos quedan fijados al crear el checkpoint; no se pueden modificar ni eliminar checkpoints que ya tengan respuestas.",
        )}
      </p>
      {rows?.map((r) => (
        <article className="checkpoint-definition" key={r._id}>
          <h3>{r.title}</h3>
          <p>
            {r.description} ·{" "}
            {new Date(r.dueAt).toLocaleString(formatLocale(), {
              timeZone: event.timezone,
            })}{" "}
            ({event.timezone})
          </p>
          <Button
            className="manage-outline"
            disabled={op.busy || event.status === "archived"}
            onClick={() => {
              setId(r._id);
              setTitle(r.title);
              setDescription(r.description ?? "");
              setDue(new Date(r.dueAt).toISOString().slice(0, 16));
              setOrder(r.order);
              setRevision(r.revision ?? 0);
            }}
          >
            {tr("Editar checkpoint")}
          </Button>
          <Button
            className="manage-outline"
            disabled={op.busy || event.status === "archived"}
            onClick={() =>
              void op.run(
                () => remove({ eventId: event._id, id: r._id }),
                "Checkpoint eliminado.",
              )
            }
          >
            {tr("Eliminar checkpoint")}
          </Button>
        </article>
      ))}
      {event.status !== "archived" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void op.run(async () => {
              await save({
                eventId: event._id,
                id,
                title,
                description,
                dueAt: Date.parse(`${due}:00Z`),
                order,
                expectedRevision: revision,
              });
              reset();
            }, "Checkpoint guardado.");
          }}
        >
          <h3>{id ? tr("Editar checkpoint") : tr("Nuevo checkpoint")}</h3>
          <label>
            {tr("Título del checkpoint")}
            <input
              aria-label={tr("Título del checkpoint")}
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            {tr("Descripción del checkpoint")}
            <textarea
              aria-label={tr("Descripción del checkpoint")}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            {tr("Fecha límite del checkpoint (UTC)")}
            <input
              aria-label={tr("Fecha límite del checkpoint (UTC)")}
              type="datetime-local"
              required
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <label>
            {tr("Orden")}
            <input
              aria-label={tr("Orden del checkpoint")}
              type="number"
              min={0}
              max={10000}
              value={order}
              onChange={(e) => setOrder(Number(e.target.value))}
            />
          </label>
          <Button type="submit" disabled={op.busy}>
            {tr("Guardar checkpoint")}
          </Button>
          {id && (
            <Button type="button" className="manage-outline" onClick={reset}>
              {tr("Cancelar edición")}
            </Button>
          )}
        </form>
      )}
      {op.message && <p role="status">{tr(op.message)}</p>}
    </div>
  );
}
function CheckpointReviews({
  eventId,
  canReview,
}: {
  eventId: Id<"events">;
  canReview: boolean;
}) {
  const { t: tr } = useI18n();

  const { results, status, loadMore } = usePaginatedQuery(
    api.checkpoints.list,
    { eventId },
    { initialNumItems: 20 },
  );
  return (
    <div className="profile-panel">
      <h2>{tr("Revisar avances")}</h2>
      {results.map((r) => (
        <CheckpointReview
          key={`${r.id}-${r.revision}`}
          row={r}
          eventId={eventId}
          canReview={canReview}
        />
      ))}
      {!results.length && <p>{tr("No hay checkpoints enviados.")}</p>}
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(20)}>{tr("Más avances")}</Button>
      )}
    </div>
  );
}
function CheckpointReview({
  row: r,
  eventId,
  canReview,
}: {
  row: FunctionReturnType<typeof api.checkpoints.list>["page"][number];
  eventId: Id<"events">;
  canReview: boolean;
}) {
  const { t: tr } = useI18n();

  const [reason, setReason] = useState(""),
    review = useMutation(api.checkpoints.review),
    op = useProjectOperation();
  return (
    <article className="project-review-card">
      <h3>
        {r.title} · {r.teamName}
      </h3>
      <span className="manage-badge">{tr(CHECKPOINT_STATUS[r.status])}</span>
      <ProjectAnswers
        fields={r.fields}
        answers={r.answers}
        source={{ checkpointSubmissionId: r.id }}
      />
      {r.reviewReason && (
        <p>
          {tr("Revisión: ")}
          {r.reviewReason}
        </p>
      )}
      {canReview && (
        <>
          <label>
            {tr("Motivo de revisión del checkpoint")}
            <textarea
              aria-label={tr("Motivo del checkpoint de {0}", {
                "0": r.teamName,
              })}
              value={reason}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button
            disabled={op.busy}
            onClick={() =>
              void op.run(
                () =>
                  review({
                    eventId,
                    id: r.id,
                    status: "accepted",
                    reason,
                    expectedRevision: r.revision,
                  }),
                "Checkpoint aceptado.",
              )
            }
          >
            {tr("Aceptar checkpoint")}
          </Button>
          <Button
            className="manage-outline"
            disabled={op.busy || !reason.trim()}
            onClick={() =>
              void op.run(
                () =>
                  review({
                    eventId,
                    id: r.id,
                    status: "rejected",
                    reason,
                    expectedRevision: r.revision,
                  }),
                "Checkpoint rechazado.",
              )
            }
          >
            {tr("Rechazar checkpoint")}
          </Button>
        </>
      )}
      {op.message && <p role="status">{tr(op.message)}</p>}
    </article>
  );
}
export function ProjectsReview({
  eventId,
  canReview,
}: {
  eventId: Id<"events">;
  canReview: boolean;
}) {
  const { t: tr } = useI18n();

  const [filter, setFilter] = useState<"" | keyof typeof PROJECT_STATUS>(""),
    { results, status, loadMore } = usePaginatedQuery(
      api.projects.list,
      { eventId, ...(filter ? { status: filter } : {}) },
      { initialNumItems: 20 },
    );
  return (
    <div className="profile-panel">
      <h2>{tr("Proyectos del evento")}</h2>
      <label>
        {tr("Estado del proyecto")}
        <select
          aria-label={tr("Filtrar proyectos por estado")}
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="">{tr("Todos los estados")}</option>
          {Object.entries(PROJECT_STATUS).map(([id, label]) => (
            <option value={id} key={id}>
              {tr(String(label))}
            </option>
          ))}
        </select>
      </label>
      {results.map((r) => (
        <ProjectReview
          key={`${r.id}-${r.revision}`}
          row={r}
          eventId={eventId}
          canReview={canReview}
        />
      ))}
      {!results.length && <p>{tr("No hay proyectos con este estado.")}</p>}
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(20)}>{tr("Más proyectos")}</Button>
      )}
    </div>
  );
}
function ProjectReview({
  row: r,
  eventId,
  canReview,
}: {
  row: FunctionReturnType<typeof api.projects.list>["page"][number];
  eventId: Id<"events">;
  canReview: boolean;
}) {
  const { t: tr } = useI18n();

  const [reason, setReason] = useState(""),
    review = useMutation(api.projects.review),
    op = useProjectOperation();
  return (
    <article className="project-review-card">
      <div className="manage-title">
        <h3>
          {r.title || tr("Sin título")} · {r.teamName}
        </h3>
        <span className="manage-badge">{tr(PROJECT_STATUS[r.status])}</span>
      </div>
      <p>{r.summary}</p>
      <p>
        {tr("Versión de entrega ")}
        {r.submissionVersion} ·{" "}
        {r.submittedAt
          ? new Date(r.submittedAt).toLocaleString(formatLocale())
          : tr("Sin entregar")}
      </p>
      <div className="project-links">
        {[
          ["Repositorio", r.repoUrl],
          ["Demo", r.demoUrl],
          ["Video", r.videoUrl],
        ].map(
          ([label, url]) =>
            url && (
              <a
                className="text-link"
                href={url}
                key={tr(String(label))}
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
          <PrivateImage key={id} id={id} source={{ submissionId: r.id }} />
        ))}
      </div>
      <ProjectAnswers
        fields={r.fields}
        answers={r.answers}
        source={{ submissionId: r.id }}
      />
      {r.reviewReason && (
        <p className="profile-notice">
          {tr("Revisión: ")}
          {r.reviewReason}
        </p>
      )}
      {canReview && r.status !== "draft" && (
        <>
          <label>
            {tr("Motivo de revisión del proyecto")}
            <textarea
              aria-label={tr("Motivo del proyecto de {0}", { "0": r.teamName })}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button
            disabled={op.busy}
            onClick={() =>
              void op.run(
                () =>
                  review({
                    eventId,
                    id: r.id,
                    status: "admitted",
                    reason,
                    expectedRevision: r.revision,
                  }),
                "Proyecto admitido.",
              )
            }
          >
            {tr("Admitir proyecto")}
          </Button>
          <Button
            className="manage-outline"
            disabled={op.busy || !reason.trim()}
            onClick={() =>
              void op.run(
                () =>
                  review({
                    eventId,
                    id: r.id,
                    status: "disqualified",
                    reason,
                    expectedRevision: r.revision,
                  }),
                "Proyecto descalificado.",
              )
            }
          >
            {tr("Descalificar proyecto")}
          </Button>
        </>
      )}
      {op.message && <p role="status">{tr(op.message)}</p>}
    </article>
  );
}
