import { useI18n } from "../../i18n/I18n";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Button } from "../../components/ui/button";
import { useProjectOperation } from "./shared";
import { ProjectEditor } from "./ProjectEditor";
import { TeamCheckpoints } from "./TeamCheckpoints";
import { TeamMentorship } from "../content/MentorshipManager";
import { eventPath } from "../../lib/eventUrls";
export function BuildWorkspace({
  eventId,
  slug,
}: {
  eventId: Id<"events">;
  slug: string;
}) {
  const { t: tr } = useI18n();

  const published = useQuery(api.forms.registration, { slug });
  if (!published)
    return (
      <p>
        {tr(
          "El espacio de construcción estará disponible mientras el evento esté publicado.",
        )}
      </p>
    );
  return <TeamHub eventId={eventId} slug={slug} />;
}
function TeamHub({ eventId, slug }: { eventId: Id<"events">; slug: string }) {
  const { t: tr } = useI18n();

  const mine = useQuery(api.teams.mine, { eventId }),
    me = useQuery(api.users.me, {}),
    [tab, setTab] = useState("team");
  if (mine === undefined || !me) return <p>{tr("Cargando tu equipo…")}</p>;
  return (
    <section className="build-workspace">
      <div className="eyebrow">{tr("CONSTRUYE EN EQUIPO")}</div>
      <h2>{tr("Del equipo al proyecto.")}</h2>
      {mine ? (
        <>
          <div className="manage-tabs">
            {[
              ["team", "Mi equipo"],
              ["checkpoints", "Checkpoints"],
              ["project", "Proyecto"],
              ["mentorship", "Mentorías"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {tr(String(label))}
              </button>
            ))}
          </div>
          {tab === "team" ? (
            <TeamCard
              key={mine.team._id}
              data={mine}
              userId={me.id}
              slug={slug}
            />
          ) : tab === "checkpoints" ? (
            <TeamCheckpoints teamId={mine.team._id} locked={mine.locked} />
          ) : tab === "mentorship" ? (
            <TeamMentorship teamId={mine.team._id} />
          ) : (
            <ProjectEditor teamId={mine.team._id} slug={slug} />
          )}
        </>
      ) : (
        <TeamStart eventId={eventId} />
      )}
    </section>
  );
}
function TeamStart({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();

  const { code: linkCode } = useParams();
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [looking, setLooking] = useState(true),
    [code, setCode] = useState(linkCode ?? ""),
    create = useMutation(api.teams.create),
    join = useMutation(api.teams.join),
    op = useProjectOperation();
  return (
    <>
      <div className="profile-grid">
        <form
          className="profile-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void op.run(
              () =>
                create({
                  eventId,
                  name,
                  description,
                  lookingForMembers: looking,
                }),
              "Equipo creado.",
            );
          }}
        >
          <h3>{tr("Crear equipo")}</h3>
          <label>
            {tr("Nombre del equipo")}
            <input
              aria-label={tr("Nombre del equipo")}
              required
              minLength={3}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {tr("¿Qué quieres construir?")}
            <textarea
              aria-label={tr("Descripción del equipo")}
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={looking}
              onChange={(e) => setLooking(e.target.checked)}
            />
            {tr("Buscamos integrantes")}
          </label>
          <Button type="submit" disabled={op.busy}>
            {tr("Crear mi equipo")}
          </Button>
        </form>
        <form
          className="profile-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void op.run(
              () => join({ eventId, code }),
              "Ya formas parte del equipo.",
            );
          }}
        >
          <h3>{tr("Unirme a un equipo")}</h3>
          <p>{tr("Pide el código o enlace a su líder.")}</p>
          <label>
            {tr("Código del equipo")}
            <input
              aria-label={tr("Código del equipo")}
              required
              value={code}
              maxLength={30}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <Button type="submit" disabled={op.busy}>
            {tr("Unirme con código")}
          </Button>
        </form>
      </div>
      {op.message && <p role="status">{tr(op.message)}</p>}
      <TeamFinder eventId={eventId} />
    </>
  );
}
function TeamFinder({
  eventId,
  sourceId,
}: {
  eventId: Id<"events">;
  sourceId?: Id<"teams">;
}) {
  const { t: tr } = useI18n();

  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    results = useQuery(api.teams.find, { eventId, search: query }),
    request = useMutation(api.teams.requestMerge),
    op = useProjectOperation();
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  return (
    <div className="profile-panel team-finder">
      <h3>{tr("Equipos que buscan integrantes")}</h3>
      <label>
        {tr("Buscar equipo")}
        <input
          aria-label={tr("Buscar equipo")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr("Nombre o idea del equipo")}
          maxLength={100}
        />
      </label>
      <div className="manage-event-grid">
        {results
          ?.filter((r) => r.id !== sourceId)
          .map((r) => (
            <article key={r.id} className="team-finder-card">
              <h4>{r.name}</h4>
              <p>{r.description}</p>
              <small>
                {r.memberCount} {tr(" integrantes")}
              </small>
              {sourceId ? (
                <Button
                  disabled={op.busy}
                  onClick={() =>
                    void op.run(
                      () => request({ sourceId, targetId: r.id }),
                      "Solicitud enviada. El líder del equipo destino debe aceptarla.",
                    )
                  }
                >
                  {tr("Solicitar fusión")}
                </Button>
              ) : (
                <p>{tr("Pide su código de invitación para unirte.")}</p>
              )}
            </article>
          ))}
      </div>
      {results?.length === 0 && (
        <p>
          {tr(
            "No hay equipos que coincidan. Puedes crear uno y abrirlo a nuevos integrantes.",
          )}
        </p>
      )}
      {op.message && <p role="status">{tr(op.message)}</p>}
    </div>
  );
}
function TeamCard({
  data,
  userId,
  slug,
}: {
  data: NonNullable<FunctionReturnType<typeof api.teams.mine>>;
  userId: Id<"users">;
  slug: string;
}) {
  const { t: tr } = useI18n();

  const {
      name: initial,
      description: initialDescription,
      lookingForMembers: initialLooking,
    } = data.team,
    [name, setName] = useState(initial),
    [description, setDescription] = useState(initialDescription ?? ""),
    [looking, setLooking] = useState(initialLooking),
    update = useMutation(api.teams.update),
    remove = useMutation(api.teams.removeMember),
    transfer = useMutation(api.teams.transfer),
    resolve = useMutation(api.teams.resolveMerge),
    cancel = useMutation(api.teams.cancelMerge),
    op = useProjectOperation(),
    leader = data.team.leaderId === userId,
    invite = `${location.origin}${eventPath(slug, `join/${data.team.joinCode}`)}`;
  return (
    <>
      <div className="profile-panel">
        <h3>{data.team.name}</h3>
        <p>
          {data.members.length} {tr(" integrantes")}
        </p>
        {data.locked && (
          <p className="profile-notice">
            {tr(
              "El equipo queda cerrado tras su primera entrega. Puedes seguir editando el proyecto hasta el cierre de entregas.",
            )}
          </p>
        )}
        <div className="team-invitation">
          <label>
            {tr("Código de invitación")}
            <input
              aria-label={tr("Código de invitación del equipo")}
              readOnly
              value={data.team.joinCode}
            />
          </label>
          <label>
            {tr("Enlace de invitación")}
            <input
              aria-label={tr("Enlace de invitación del equipo")}
              readOnly
              value={invite}
            />
          </label>
          <Button
            className="manage-outline"
            onClick={() =>
              void op.run(
                () => navigator.clipboard.writeText(invite),
                "Enlace copiado.",
              )
            }
          >
            {tr("Copiar enlace del equipo")}
          </Button>
        </div>
        <ul className="team-roster">
          {data.members.map((m) => (
            <li key={m.id}>
              <span>
                {m.name}
                {m.userId === data.team.leaderId ? tr(" · Líder") : ""}
                {m.userId === userId ? tr(" · Tú") : ""}
              </span>
              {!data.locked && leader && m.userId !== userId && (
                <div>
                  <Button
                    className="manage-outline"
                    disabled={op.busy}
                    onClick={() =>
                      void op.run(
                        () =>
                          transfer({ teamId: data.team._id, memberId: m.id }),
                        "Liderazgo transferido.",
                      )
                    }
                  >
                    {tr("Hacer líder")}
                  </Button>
                  <Button
                    className="manage-outline"
                    disabled={op.busy}
                    onClick={() =>
                      void op.run(
                        () => remove({ teamId: data.team._id, memberId: m.id }),
                        "Integrante retirado.",
                      )
                    }
                  >
                    {tr("Retirar integrante")}
                  </Button>
                </div>
              )}
              {!data.locked &&
                m.userId === userId &&
                (!leader || data.members.length === 1) && (
                  <Button
                    className="manage-outline"
                    disabled={op.busy}
                    onClick={() =>
                      void op.run(
                        () => remove({ teamId: data.team._id, memberId: m.id }),
                        "Saliste del equipo.",
                      )
                    }
                  >
                    {tr("Salir del equipo")}
                  </Button>
                )}
            </li>
          ))}
        </ul>
        {leader && !data.locked && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void op.run(
                () =>
                  update({
                    teamId: data.team._id,
                    name,
                    description,
                    lookingForMembers: looking,
                  }),
                "Equipo actualizado.",
              );
            }}
          >
            <label>
              {tr("Nombre del equipo")}
              <input
                aria-label={tr("Editar nombre del equipo")}
                required
                minLength={3}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              {tr("Descripción")}
              <textarea
                aria-label={tr("Editar descripción del equipo")}
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={looking}
                onChange={(e) => setLooking(e.target.checked)}
              />
              {tr("Buscamos integrantes")}
            </label>
            <Button type="submit" disabled={op.busy}>
              {tr("Guardar equipo")}
            </Button>
          </form>
        )}
        {leader && data.outgoing && (
          <article className="merge-request">
            <p>
              {tr("Solicitud de fusión enviada a ")}
              {data.outgoing.targetName}.
            </p>
            <Button
              className="manage-outline"
              disabled={op.busy}
              onClick={() =>
                void op.run(
                  () => cancel({ id: data.outgoing!.id }),
                  "Solicitud cancelada.",
                )
              }
            >
              {tr("Cancelar solicitud de fusión")}
            </Button>
          </article>
        )}
        {leader &&
          data.requests.map((r) => (
            <article className="merge-request" key={r.id}>
              <h4>
                {r.sourceName} {tr(" propone una fusión")}
              </h4>
              <p>
                {tr(
                  "Se incorporarán sus integrantes y checkpoints a tu equipo. Se conserva el borrador del proyecto de tu equipo; el equipo de origen se cierra.",
                )}
              </p>
              <Button
                disabled={op.busy || data.locked}
                onClick={() =>
                  void op.run(
                    () => resolve({ id: r.id, accept: true }),
                    "Equipos fusionados.",
                  )
                }
              >
                {tr("Aceptar fusión")}
              </Button>
              <Button
                className="manage-outline"
                disabled={op.busy}
                onClick={() =>
                  void op.run(
                    () => resolve({ id: r.id, accept: false }),
                    "Solicitud rechazada.",
                  )
                }
              >
                {tr("Rechazar fusión")}
              </Button>
            </article>
          ))}
        {op.message && <p role="status">{tr(op.message)}</p>}
      </div>
      {leader && !data.locked && (
        <TeamFinder eventId={data.team.eventId} sourceId={data.team._id} />
      )}
    </>
  );
}
