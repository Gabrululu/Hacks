import { useI18n, formatLocale } from "../../i18n/I18n";
import { useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import { useProjectOperation } from "../projects/shared";
type Setup = FunctionReturnType<typeof api.judging.setup>;
type Round = Setup["rounds"][number];
const STATES = { pending: "Preparación", open: "Abierta", closed: "Cerrada" };
export function JudgingManager({
  event,
  permissions,
}: {
  event: Doc<"events">;
  permissions: string[];
}) {
  const { t: tr } = useI18n();

  const data = useQuery(api.judging.setup, { eventId: event._id }),
    [selected, setSelected] = useState(""),
    close = useMutation(api.judging.closeEvent),
    publish = useMutation(api.judging.publish),
    [winners, setWinners] = useState(1),
    op = useProjectOperation();
  if (!data) return <p>{tr("Cargando evaluación…")}</p>;
  const entry =
      selected === "new"
        ? undefined
        : (data.rounds.find((r) => r.round._id === selected) ?? data.rounds[0]),
    round = entry?.round,
    readOnly =
      event.status === "archived" ||
      event.judgingClosed ||
      event.resultsPublished,
    final = data.rounds.at(-1)?.round;
  return (
    <div className="judging-workspace">
      <div className="profile-panel">
        <h2>{tr("Evaluación del evento")}</h2>
        <p>
          {tr(
            "Las asignaciones abren después del cierre de entregas. Cada juez evalúa una versión fija de un proyecto admitido. La organización define el formato con criterios, escalas, pesos y desempates; el orden de proyectos se aleatoriza por juez. Los criterios se normalizan a 0–100 y se promedian con sus pesos.",
          )}
        </p>
        <p>
          {tr("Fecha límite del jurado:")}{" "}
          {new Date(event.timeline.judgingClosesAt).toLocaleString(
            formatLocale(),
            {
              timeZone: event.timezone,
            },
          )}{" "}
          ({event.timezone}).
        </p>
        <label>
          {tr("Ronda de evaluación")}
          <select
            aria-label={tr("Ronda de evaluación")}
            value={selected === "new" ? "new" : (round?._id ?? "new")}
            onChange={(e) => setSelected(e.target.value)}
          >
            {data.rounds.map((r) => (
              <option key={r.round._id} value={r.round._id}>
                {r.round.name} · {tr(STATES[r.round.status])}
              </option>
            ))}
            {permissions.includes("judges.manage") && !readOnly && (
              <option value="new">{tr("Nueva ronda")}</option>
            )}
          </select>
        </label>
        {permissions.includes("judges.manage") && (
          <RoundEditor
            key={`${round?._id ?? "new"}-${round?.revision ?? 0}`}
            eventId={event._id}
            entry={entry}
            readOnly={
              readOnly ||
              round?.status === "open" ||
              round?.status === "closed" ||
              round?.autoState === "running"
            }
            defaultOrder={
              data.rounds.length
                ? Math.max(...data.rounds.map((r) => r.round.order)) + 1
                : 0
            }
            onSaved={setSelected}
          />
        )}
      </div>
      {round && (
        <>
          <RoundControls
            event={event}
            round={round}
            permissions={permissions}
          />
          {permissions.includes("judging.assign") && (
            <Assignments
              key={round._id}
              event={event}
              data={data}
              round={round}
            />
          )}
          <Ranking eventId={event._id} round={round} />
        </>
      )}
      <div className="profile-panel">
        <h3>{tr("Cierre y publicación")}</h3>
        <p>
          {tr(
            "Cierra todas las rondas y espera sus rankings antes de cerrar la evaluación. Publicar hace visibles los puestos, ganadores y feedback público. Las notas privadas quedan reservadas a organizadores.",
          )}
        </p>
        {event.judgingClosed && (
          <p className="profile-notice">
            {tr("Evaluación cerrada. Los puntajes están congelados.")}
          </p>
        )}
        {event.resultsPublished && (
          <p className="profile-notice">
            {tr("Resultados publicados. No se pueden modificar.")}
          </p>
        )}
        {permissions.includes("judging.close") && !event.judgingClosed && (
          <Button
            disabled={
              op.busy ||
              event.status !== "published" ||
              !data.rounds.length ||
              data.rounds.some(
                (r) =>
                  r.round.status !== "closed" ||
                  r.round.resultsState !== "ready",
              )
            }
            onClick={() =>
              void op.run(
                () => close({ eventId: event._id }),
                "Evaluación cerrada.",
              )
            }
          >
            {tr("Cerrar evaluación")}
          </Button>
        )}
        {permissions.includes("results.publish") &&
          event.judgingClosed &&
          !event.resultsPublished &&
          final && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void op.run(
                  () =>
                    publish({
                      eventId: event._id,
                      roundId: final._id,
                      winnerCount: winners,
                    }),
                  "Resultados publicados.",
                );
              }}
            >
              <label>
                {tr("Número de ganadores")}
                <input
                  aria-label={tr("Número de ganadores")}
                  type="number"
                  min={1}
                  max={20}
                  value={winners}
                  onChange={(e) => setWinners(Number(e.target.value))}
                />
              </label>
              <p>
                {tr("Se publicará el ranking de ")}
                {final.name} {tr(" y sus primeros ")}
                {winners} {tr("puestos como ganadores.")}
              </p>
              <Button
                type="submit"
                disabled={op.busy || event.status !== "published"}
              >
                {tr("Publicar resultados")}
              </Button>
            </form>
          )}
        {op.message && <p role="status">{tr(op.message)}</p>}
      </div>
    </div>
  );
}
function RoundEditor({
  eventId,
  entry,
  readOnly,
  defaultOrder,
  onSaved,
}: {
  eventId: Id<"events">;
  entry?: Round;
  readOnly: boolean;
  defaultOrder: number;
  onSaved: (id: string) => void;
}) {
  const { t: tr } = useI18n();

  const [name, setName] = useState(entry?.round.name ?? ""),
    [order, setOrder] = useState(entry?.round.order ?? defaultOrder),
    [min, setMin] = useState(entry?.round.minReviews ?? 1),
    [tie, setTie] = useState(entry?.round.tieBreakCriterion ?? ""),
    [criteria, setCriteria] = useState(
      entry?.criteria ?? [
        {
          id: "impact",
          name: "Impacto",
          description: "Utilidad para las personas y comunidades.",
          weight: 50,
          min: 0,
          max: 10,
        },
        {
          id: "technical",
          name: "Calidad técnica",
          description: "Solidez y funcionamiento del proyecto.",
          weight: 50,
          min: 0,
          max: 10,
        },
      ],
    ),
    save = useMutation(api.judging.saveRound),
    op = useProjectOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void op.run(async () => {
          const id = await save({
            eventId,
            id: entry?.round._id,
            name,
            order,
            minReviews: min,
            tieBreakCriterion: tie || undefined,
            criteria,
            expectedRevision: entry?.round.revision ?? 0,
          });
          onSaved(id);
        }, "Ronda y rúbrica guardadas.");
      }}
    >
      <fieldset disabled={readOnly || op.busy}>
        <h3>
          {entry ? tr("Rúbrica de la ronda") : tr("Crear ronda y rúbrica")}
        </h3>
        <label>
          {tr("Nombre de la ronda")}
          <input
            aria-label={tr("Nombre de la ronda")}
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="judging-form-row">
          <label>
            {tr("Orden de la ronda")}
            <input
              aria-label={tr("Orden de la ronda")}
              type="number"
              min={0}
              max={100}
              value={order}
              onChange={(e) => setOrder(Number(e.target.value))}
            />
          </label>
          <label>
            {tr("Evaluaciones mínimas por proyecto")}
            <input
              aria-label={tr("Evaluaciones mínimas por proyecto")}
              type="number"
              min={1}
              max={10}
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
            />
          </label>
        </div>
        {criteria.map((c, i) => (
          <div className="rubric-criterion" key={c.id}>
            <h4>
              {tr("Criterio ")}
              {i + 1}
            </h4>
            <label>
              {tr("Nombre del criterio")}
              <input
                aria-label={tr("Nombre del criterio {0}", { "0": i + 1 })}
                value={c.name}
                required
                maxLength={120}
                onChange={(e) =>
                  setCriteria((old) =>
                    old.map((row, n) =>
                      n === i ? { ...row, name: e.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              {tr("Descripción del criterio")}
              <textarea
                aria-label={tr("Descripción del criterio {0}", { "0": i + 1 })}
                maxLength={2000}
                value={c.description ?? ""}
                onChange={(e) =>
                  setCriteria((old) =>
                    old.map((row, n) =>
                      n === i ? { ...row, description: e.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <div className="judging-form-row">
              {[
                ["Peso", "weight"],
                ["Mínimo", "min"],
                ["Máximo", "max"],
              ].map(([label, key]) => (
                <label key={key}>
                  {tr(String(label))}
                  <input
                    aria-label={tr("{0} del criterio {1}", {
                      "0": tr(label),
                      "1": i + 1,
                    })}
                    type="number"
                    step="any"
                    value={c[key as "weight" | "min" | "max"]}
                    onChange={(e) =>
                      setCriteria((old) =>
                        old.map((row, n) =>
                          n === i
                            ? { ...row, [key]: Number(e.target.value) }
                            : row,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <Button
              type="button"
              className="manage-outline"
              disabled={criteria.length === 1}
              onClick={() => {
                setCriteria((old) => old.filter((_, n) => n !== i));
                if (tie === c.id) setTie("");
              }}
            >
              {tr("Quitar criterio ")}
              {i + 1}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          className="manage-outline"
          disabled={criteria.length >= 20}
          onClick={() =>
            setCriteria((old) => [
              ...old,
              {
                id: crypto.randomUUID(),
                name: "Nuevo criterio",
                description: "",
                weight: 1,
                min: 0,
                max: 10,
              },
            ])
          }
        >
          {tr("Añadir criterio")}
        </Button>
        <label>
          {tr("Desempate principal")}
          <select
            aria-label={tr("Desempate principal")}
            value={tie}
            onChange={(e) => setTie(e.target.value)}
          >
            <option value="">{tr("Entrega más temprana")}</option>
            {criteria.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          {tr(
            "Si persiste un empate, se prioriza la entrega más temprana y después el orden estable de los registros.",
          )}
        </p>
        {!readOnly && (
          <Button type="submit">{tr("Guardar ronda y rúbrica")}</Button>
        )}
      </fieldset>
      {readOnly && <p>{tr("La rúbrica queda fijada al abrir la ronda.")}</p>}
      {op.message && <p role="status">{tr(op.message)}</p>}
    </form>
  );
}
function RoundControls({
  event,
  round: r,
  permissions,
}: {
  event: Doc<"events">;
  round: Doc<"judgingRounds">;
  permissions: string[];
}) {
  const { t: tr } = useI18n();

  const [force, setForce] = useState(false),
    open = useMutation(api.judging.openRound),
    close = useMutation(api.judging.closeRound),
    retry = useMutation(api.judging.retryResults),
    op = useProjectOperation(),
    blocked =
      event.status !== "published" ||
      event.judgingClosed ||
      event.resultsPublished;
  return (
    <div className="profile-panel">
      <h3>
        {r.name} · {tr(STATES[r.status])}
      </h3>
      {r.status === "pending" && permissions.includes("judging.assign") && (
        <Button
          disabled={op.busy || blocked || r.autoState === "running"}
          onClick={() =>
            void op.run(
              () =>
                open({
                  eventId: event._id,
                  roundId: r._id,
                  expectedRevision: r.revision ?? 0,
                }),
              "Ronda abierta.",
            )
          }
        >
          {tr("Abrir ronda")}
        </Button>
      )}
      {r.status === "open" && permissions.includes("judging.close") && (
        <>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            {tr("Cerrar aunque existan evaluaciones pendientes")}
          </label>
          <p>
            {tr(
              "Los proyectos con menos evaluaciones que el mínimo de la rúbrica quedarán sin clasificación.",
            )}
          </p>
          <Button
            disabled={op.busy || blocked}
            onClick={() =>
              void op.run(
                () =>
                  close({
                    eventId: event._id,
                    roundId: r._id,
                    expectedRevision: r.revision ?? 0,
                    force,
                  }),
                "Ronda cerrada. Generando ranking…",
              )
            }
          >
            {tr("Cerrar ronda")}
          </Button>
        </>
      )}
      {r.status === "closed" && (
        <p role="status">
          {r.resultsState === "ready"
            ? tr("Ranking listo.")
            : r.resultsState === "failed"
              ? r.resultsError
              : tr("Generando ranking…")}
        </p>
      )}
      {r.resultsState === "failed" && permissions.includes("judging.close") && (
        <Button
          disabled={op.busy || event.resultsPublished}
          onClick={() =>
            void op.run(
              () => retry({ eventId: event._id, roundId: r._id }),
              "Generando ranking nuevamente…",
            )
          }
        >
          {tr("Reintentar ranking")}
        </Button>
      )}
      {op.message && <p role="status">{tr(op.message)}</p>}
    </div>
  );
}
function Assignments({
  event,
  data,
  round: r,
}: {
  event: Doc<"events">;
  data: Setup;
  round: Doc<"judgingRounds">;
}) {
  const { t: tr } = useI18n();

  const [project, setProject] = useState(""),
    [judge, setJudge] = useState(""),
    [pool, setPool] = useState<Id<"users">[]>(data.judges.map((j) => j.id)),
    [per, setPer] = useState(Math.min(10, event.settings.judgesPerSubmission)),
    [max, setMax] = useState(20),
    [track, setTrack] = useState(""),
    assign = useMutation(api.judging.assign),
    auto = useMutation(api.judging.autoAssign),
    cancel = useMutation(api.judging.cancelAuto),
    remove = useMutation(api.judging.removeAssignment),
    op = useProjectOperation(),
    {
      results: projects,
      status: projectStatus,
      loadMore: moreProjects,
    } = usePaginatedQuery(
      api.judging.candidates,
      { eventId: event._id },
      { initialNumItems: 20 },
    ),
    {
      results: rows,
      status,
      loadMore,
    } = usePaginatedQuery(
      api.judging.listAssignments,
      { eventId: event._id, roundId: r._id },
      { initialNumItems: 20 },
    ),
    editable =
      r.status === "pending" &&
      r.autoState !== "running" &&
      !event.judgingClosed &&
      !event.resultsPublished &&
      event.status === "published";
  return (
    <div className="profile-panel">
      <h3>{tr("Asignaciones del jurado")}</h3>
      {editable && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void op.run(
                () =>
                  assign({
                    eventId: event._id,
                    roundId: r._id,
                    judgeId: judge as Id<"users">,
                    submissionId: project as Id<"submissions">,
                  }),
                "Asignación creada.",
              );
            }}
          >
            <h4>{tr("Asignación manual")}</h4>
            <label>
              {tr("Proyecto admitido")}
              <select
                aria-label={tr("Proyecto admitido")}
                required
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">{tr("Selecciona un proyecto")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {p.teamName}
                  </option>
                ))}
              </select>
            </label>
            {projectStatus === "CanLoadMore" && (
              <Button
                type="button"
                className="manage-outline"
                onClick={() => moreProjects(20)}
              >
                {tr("Más proyectos admitidos")}
              </Button>
            )}
            <label>
              {tr("Juez")}
              <select
                aria-label={tr("Juez para asignación manual")}
                required
                value={judge}
                onChange={(e) => setJudge(e.target.value)}
              >
                <option value="">{tr("Selecciona un juez")}</option>
                {data.judges.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={op.busy} type="submit">
              {tr("Asignar juez")}
            </Button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void op.run(
                () =>
                  auto({
                    eventId: event._id,
                    roundId: r._id,
                    judges: pool,
                    perProject: per,
                    maxPerJudge: max,
                    trackId: track ? (track as Id<"tracks">) : undefined,
                  }),
                "Asignación automática iniciada.",
              );
            }}
          >
            <h4>{tr("Asignación automática balanceada")}</h4>
            <p>
              {tr(
                "Se mantiene el máximo de proyectos por juez y se excluyen proyectos de su propio equipo. Las asignaciones existentes no se duplican.",
              )}
            </p>
            {data.judges.map((j) => (
              <label className="checkbox-row" key={j.id}>
                <input
                  type="checkbox"
                  checked={pool.includes(j.id)}
                  onChange={(e) =>
                    setPool((old) =>
                      e.target.checked
                        ? [...old, j.id]
                        : old.filter((id) => id !== j.id),
                    )
                  }
                />
                {j.name}
              </label>
            ))}
            {!data.judges.length && (
              <p>{tr("Invita jueces desde Staff para continuar.")}</p>
            )}
            <div className="judging-form-row">
              <label>
                {tr("Jueces por proyecto")}
                <input
                  aria-label={tr("Jueces por proyecto")}
                  type="number"
                  min={1}
                  max={10}
                  value={per}
                  onChange={(e) => setPer(Number(e.target.value))}
                />
              </label>
              <label>
                {tr("Máximo de proyectos por juez")}
                <input
                  aria-label={tr("Máximo de proyectos por juez")}
                  type="number"
                  min={1}
                  max={100}
                  value={max}
                  onChange={(e) => setMax(Number(e.target.value))}
                />
              </label>
            </div>
            <label>
              {tr("Asignar por track")}
              <select
                aria-label={tr("Asignar por track")}
                value={track}
                onChange={(e) => setTrack(e.target.value)}
              >
                <option value="">{tr("Todos los tracks")}</option>
                {data.tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={op.busy || !pool.length || pool.length > 20}
              type="submit"
            >
              {tr("Asignar automáticamente")}
            </Button>
          </form>
        </>
      )}
      {r.autoState && (
        <p role="status">
          {tr("Asignación automática:")}{" "}
          {tr(
            {
              running: "en curso",
              completed: "completada",
              failed: "falló",
              cancelled: "cancelada",
            }[r.autoState],
          )}
          . {r.autoAssigned ?? 0} {tr(" asignaciones nuevas; ")}
          {r.autoUnfilled ?? 0}{" "}
          {tr("proyectos sin completar el número solicitado. ")}
          {r.autoError}
        </p>
      )}
      {r.autoState === "running" && (
        <Button
          disabled={op.busy}
          className="manage-outline"
          onClick={() =>
            void op.run(
              () => cancel({ eventId: event._id, roundId: r._id }),
              "Asignación automática cancelada.",
            )
          }
        >
          {tr("Detener asignación automática")}
        </Button>
      )}
      <div className="judging-assignment-list">
        {rows.map(
          ({
            assignment: a,
            title,
            judgeName,
            score,
            privateNote,
            publicFeedback,
          }) => (
            <article key={a._id}>
              <h4>
                {title} · {judgeName}
              </h4>
              <p>
                {tr(
                  {
                    assigned: "Pendiente",
                    scored: "Evaluado",
                    abstained: "Abstención",
                  }[a.status],
                )}
                {score !== null ? ` · ${score.toFixed(2)} / 100` : ""}
              </p>
              {a.abstainReason && (
                <p>
                  {tr("Abstención: ")}
                  {a.abstainReason}
                </p>
              )}
              {privateNote && (
                <p>
                  {tr("Nota privada: ")}
                  {privateNote}
                </p>
              )}
              {publicFeedback && (
                <p>
                  {tr("Feedback público: ")}
                  {publicFeedback}
                </p>
              )}
              {editable && (
                <Button
                  disabled={op.busy}
                  className="manage-outline"
                  onClick={() =>
                    void op.run(
                      () => remove({ eventId: event._id, id: a._id }),
                      "Asignación retirada.",
                    )
                  }
                >
                  {tr("Retirar asignación")}
                </Button>
              )}
            </article>
          ),
        )}
      </div>
      {status === "CanLoadMore" && (
        <Button className="manage-outline" onClick={() => loadMore(20)}>
          {tr("Más asignaciones")}
        </Button>
      )}
      {op.message && <p role="status">{tr(op.message)}</p>}
    </div>
  );
}
function Ranking({
  eventId,
  round,
}: {
  eventId: Id<"events">;
  round: Doc<"judgingRounds">;
}) {
  const { t: tr } = useI18n();

  const [incomplete, setIncomplete] = useState(false),
    { results, status, loadMore } = usePaginatedQuery(
      api.judging.ranking,
      { eventId, roundId: round._id, eligible: !incomplete },
      { initialNumItems: 20 },
    );
  return (
    <div className="profile-panel">
      <h3>
        {tr("Ranking de ")}
        {round.name}
      </h3>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={incomplete}
          onChange={(e) => setIncomplete(e.target.checked)}
        />
        {tr("Ver proyectos sin evaluaciones suficientes")}
      </label>
      {round.resultsState !== "ready" ? (
        <p>{tr("El ranking se genera al cerrar esta ronda.")}</p>
      ) : (
        <>
          <div className="ranking-table-wrap">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>{tr("Puesto")}</th>
                  <th>{tr("Proyecto / Equipo")}</th>
                  <th>{tr("Puntaje")}</th>
                  <th>{tr("Evaluaciones")}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    <td>{r.rank ?? tr("Sin clasificación")}</td>
                    <td>
                      {r.title}
                      <small>{r.teamName}</small>
                    </td>
                    <td>{r.score.toFixed(2)} / 100</td>
                    <td>
                      {r.reviews} {tr(" evaluados · ")}
                      {r.abstentions} {tr(" abstenciones ·")} {r.pending}{" "}
                      {tr(" pendientes")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!results.length && (
            <p>{tr("No hay proyectos en esta clasificación.")}</p>
          )}
          {status === "CanLoadMore" && (
            <Button onClick={() => loadMore(20)}>{tr("Más resultados")}</Button>
          )}
        </>
      )}
    </div>
  );
}
