import { useI18n, formatLocale } from "../../i18n/I18n";
import { useState } from "react";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import {
  useProjectOperation,
  useClock,
  ProjectAnswers,
  PrivateImage,
} from "../projects/shared";
export function JudgePanel({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();

  const { results, status, loadMore } = usePaginatedQuery(
      api.judging.myAssignments,
      { eventId },
      { initialNumItems: 20 },
    ),
    [selected, setSelected] = useState<Id<"judgeAssignments">>();
  return (
    <div className="judge-panel">
      <div className="profile-panel">
        <h2>{tr("Mis evaluaciones")}</h2>
        <p>
          {tr(
            "Evalúa únicamente los proyectos asignados. Si tienes un conflicto de interés, registra tu abstención antes de puntuar.",
          )}
        </p>
        <p className="manage-caption">
          {tr(
            "Los proyectos se presentan en un orden aleatorio y estable para ti, independiente del orden de los demás jueces.",
          )}
        </p>
        <div className="judge-queue">
          {results.map((a) => (
            <button
              key={a.id}
              aria-pressed={selected === a.id}
              onClick={() => setSelected(a.id)}
            >
              <strong>
                <span className="judge-project-position">
                  {String(a.position).padStart(2, "0")}/{a.total}
                </span>
                {a.title}
              </strong>
              <span>
                {a.roundName} ·{" "}
                {tr(
                  (
                    {
                      assigned: "Pendiente",
                      scored: "Evaluado",
                      abstained: "Abstención",
                    } as Record<string, string>
                  )[a.status],
                )}{" "}
                ·{" "}
                {a.roundStatus === "open"
                  ? tr("Ronda abierta")
                  : a.roundStatus === "pending"
                    ? tr("En preparación")
                    : tr("Ronda cerrada")}
              </span>
            </button>
          ))}
        </div>
        {!results.length && (
          <p>{tr("Todavía no tienes proyectos asignados.")}</p>
        )}
        {status === "CanLoadMore" && (
          <Button onClick={() => loadMore(20)}>{tr("Más evaluaciones")}</Button>
        )}
      </div>
      {selected && <Assignment id={selected} />}
    </div>
  );
}
function Assignment({ id }: { id: Id<"judgeAssignments"> }) {
  const { t: tr } = useI18n();

  const data = useQuery(api.judging.assignment, { id });
  return data ? (
    <ScoreEditor key={id} data={data} />
  ) : (
    <p>{tr("Cargando entrega…")}</p>
  );
}
function ScoreEditor({
  data: d,
}: {
  data: FunctionReturnType<typeof api.judging.assignment>;
}) {
  const { t: tr } = useI18n();

  const [values, setValues] = useState<Record<string, number>>(
      d.score?.criteria ??
        Object.fromEntries(d.criteria.map((c) => [c.id, c.min])),
    ),
    [privateNote, setPrivate] = useState(d.score?.privateNote ?? ""),
    [feedback, setFeedback] = useState(d.score?.publicFeedback ?? ""),
    [revision, setRevision] = useState(d.assignment.revision ?? 0),
    [reason, setReason] = useState(""),
    save = useMutation(api.judging.saveScore),
    abstain = useMutation(api.judging.abstain),
    op = useProjectOperation(),
    now = useClock(),
    closed =
      d.closed ||
      d.roundStatus !== "open" ||
      now >= d.deadline ||
      d.assignment.status === "abstained",
    stale = (d.assignment.revision ?? 0) !== revision,
    p = d.project;
  return (
    <article className="profile-panel judge-score-editor">
      <div className="eyebrow">{d.roundName}</div>
      <h2>{p.title}</h2>
      <p>{p.summary}</p>
      <p>
        {tr("Fecha límite: ")}
        {new Date(d.deadline).toLocaleString(formatLocale())}
      </p>
      <div className="project-links">
        {[
          ["Repositorio", p.repoUrl],
          ["Demo", p.demoUrl],
          ["Video", p.videoUrl],
        ].map(
          ([label, url]) =>
            url && (
              <a
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
      {p.contractId && (
        <p className="wallet-address">
          {tr("Contrato: ")}
          {p.contractId}
        </p>
      )}
      <div className="project-images">
        {p.imageIds.map((id) => (
          <PrivateImage key={id} id={id} source={{ versionId: p.versionId }} />
        ))}
      </div>
      <ProjectAnswers
        fields={p.fields}
        answers={p.answers}
        source={{ versionId: p.versionId }}
      />
      {closed && (
        <p className="profile-notice">
          {tr("Esta evaluación no admite cambios en este momento.")}
        </p>
      )}
      {stale && (
        <p role="status">
          {tr("La evaluación cambió en otra sesión. Recarga antes de guardar.")}
        </p>
      )}
      <Button
        className="manage-outline"
        disabled={op.busy}
        onClick={() => {
          setValues(
            d.score?.criteria ??
              Object.fromEntries(d.criteria.map((c) => [c.id, c.min])),
          );
          setPrivate(d.score?.privateNote ?? "");
          setFeedback(d.score?.publicFeedback ?? "");
          setRevision(d.assignment.revision ?? 0);
        }}
      >
        {tr("Recargar evaluación guardada")}
      </Button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void op.run(async () => {
            await save({
              id: d.assignment._id,
              criteria: values,
              privateNote,
              publicFeedback: feedback,
              expectedRevision: revision,
            });
            setRevision(revision + 1);
          }, "Evaluación guardada.");
        }}
      >
        <fieldset disabled={closed || stale || op.busy}>
          <h3>{tr("Puntaje por criterio")}</h3>
          {d.criteria.map((c) => (
            <div className="rubric-criterion" key={c.id}>
              <label>
                {c.name} {tr(" · peso ")}
                {c.weight}
                <input
                  aria-label={tr("Puntaje: {0}", { "0": c.name })}
                  type="number"
                  step="any"
                  required
                  min={c.min}
                  max={c.max}
                  value={values[c.id] ?? c.min}
                  onChange={(e) =>
                    setValues((old) => ({
                      ...old,
                      [c.id]: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <p>
                {c.description} {tr(" Escala: ")}
                {c.min}–{c.max}.
              </p>
            </div>
          ))}
          <label>
            {tr("Nota privada para organizadores")}
            <textarea
              aria-label={tr("Nota privada para organizadores")}
              rows={3}
              maxLength={4000}
              value={privateNote}
              onChange={(e) => setPrivate(e.target.value)}
            />
          </label>
          <label>
            {tr("Feedback público para el equipo")}
            <textarea
              aria-label={tr("Feedback público para el equipo")}
              rows={3}
              maxLength={4000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <p>
            {tr(
              "El feedback público se muestra al publicar resultados. La nota privada solo la verán los organizadores y tú.",
            )}
          </p>
          <Button type="submit">{tr("Guardar evaluación")}</Button>
        </fieldset>
      </form>
      {d.assignment.status === "assigned" && !closed && (
        <form
          className="judge-abstention"
          onSubmit={(e) => {
            e.preventDefault();
            void op.run(async () => {
              await abstain({
                id: d.assignment._id,
                reason,
                expectedRevision: revision,
              });
              setRevision(revision + 1);
            }, "Abstención registrada.");
          }}
        >
          <h3>{tr("Abstenerme de este proyecto")}</h3>
          <p>
            {tr(
              "La abstención retira tu evaluación de este proyecto y debe tener un motivo. No se puede revertir para esta asignación.",
            )}
          </p>
          <label>
            {tr("Motivo de abstención")}
            <textarea
              aria-label={tr("Motivo de abstención")}
              required
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button
            className="manage-outline"
            disabled={op.busy || stale || !reason.trim()}
            type="submit"
          >
            {tr("Registrar abstención")}
          </Button>
        </form>
      )}
      {d.assignment.abstainReason && (
        <p>
          {tr("Abstención: ")}
          {d.assignment.abstainReason}
        </p>
      )}
      {op.message && <p role="status">{tr(op.message)}</p>}
    </article>
  );
}
