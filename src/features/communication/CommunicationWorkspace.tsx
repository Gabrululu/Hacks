import { useI18n, formatLocale } from "../../i18n/I18n";
import { useState } from "react";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import ReactMarkdown from "react-markdown";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "../../components/ui/button";
const audiences = {
  all: "Todos los inscritos",
  approved: "Aprobados y con check-in",
  pending: "Pendientes",
  teams_without_submission: "Equipos sin entrega",
  judges: "Jurado",
  mentors: "Mentores",
  filtered: "Respuesta del formulario",
};
const statuses: Record<string, string> = {
  draft: "Borrador",
  preparing: "Preparando destinatarios",
  scheduled: "Programada",
  sending: "Enviando",
  sent: "Procesada",
  failed: "Falló",
  cancelled: "Cancelada",
  queued: "En cola",
  development: "Buzón local",
  delivered: "Entregado",
  delivery_delayed: "Demorado",
  bounced: "Rebotado",
  complained: "Queja",
  suppressed: "Bloqueado",
  skipped: "Omitido por baja o perfil cambiado",
};
export function CommunicationWorkspace({
  event,
  permissions,
}: {
  event: Doc<"events">;
  permissions: readonly string[];
}) {
  const { t: tr } = useI18n();

  const [tab, setTab] = useState("campaigns");
  const [now] = useState(Date.now);
  const me = useQuery(api.users.me, {});
  const quota = useQuery(api.communication.quota, { eventId: event._id, now });
  return (
    <div className="communication-workspace">
      <div className="profile-panel">
        <h2>{tr("Comunicación del evento")}</h2>
        <p>
          {tr("Correos este mes:")}{" "}
          {quota
            ? tr("{0} disponibles de {1}. Se renueva el {2}.", {
                "0": quota.remaining,
                "1": quota.limit,
                "2": new Date(quota.end).toLocaleDateString(formatLocale()),
              })
            : tr("Cargando cuota…")}
        </p>
        <p>
          {tr(
            "Inscripciones, invitaciones y resultados son transaccionales. Los anuncios por correo respetan las preferencias de cada persona.",
          )}
        </p>
      </div>
      {me?.platformRole === "superadmin" && (
        <QuotaEditor eventId={event._id} current={quota?.limit ?? 1000} />
      )}
      <div className="manage-tabs">
        {permissions.includes("email.send") && (
          <button
            className={tab === "campaigns" ? "active" : ""}
            onClick={() => setTab("campaigns")}
          >
            {tr("Campañas de correo")}
          </button>
        )}
        {permissions.includes("announcements.post") && (
          <button
            className={tab === "announcements" ? "active" : ""}
            onClick={() => setTab("announcements")}
          >
            {tr("Anuncios en la app")}
          </button>
        )}
      </div>
      {tab === "campaigns" && permissions.includes("email.send") ? (
        <Campaigns event={event} />
      ) : permissions.includes("announcements.post") ? (
        <AnnouncementEditor eventId={event._id} />
      ) : null}
    </div>
  );
}
function Campaigns({ event }: { event: Doc<"events"> }) {
  const { t: tr } = useI18n();

  const campaigns = useQuery(api.communication.campaigns, {
    eventId: event._id,
  });
  const [selected, setSelected] = useState<Id<"emailCampaigns"> | undefined>();
  const [subject, setSubject] = useState("Novedades de {{eventName}}"),
    [body, setBody] = useState(
      "Hola {{name}},\n\nTenemos novedades para {{teamName}}.",
    ),
    [kind, setKind] = useState<keyof typeof audiences>("all"),
    [fieldId, setFieldId] = useState(""),
    [equals, setEquals] = useState(""),
    [schedule, setSchedule] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const save = useMutation(api.communication.save),
    send = useMutation(api.communication.send),
    test = useMutation(api.communication.test),
    cancel = useMutation(api.communication.cancel),
    retry = useMutation(api.communication.retry);
  const current = campaigns?.find((c) => c._id === selected),
    editable = !current || current.status === "draft";
  async function perform(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      setNotice(message);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo completar la operación.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function persist() {
    const id = await save({
      eventId: event._id,
      id: selected,
      subject,
      bodyMarkdown: body,
      audience: { kind, ...(kind === "filtered" ? { fieldId, equals } : {}) },
    });
    setSelected(id);
    return id;
  }
  function choose(c?: Doc<"emailCampaigns">) {
    setSelected(c?._id);
    setSubject(c?.subject ?? "Novedades de {{eventName}}");
    setBody(
      c?.bodyMarkdown ??
        "Hola {{name}},\n\nTenemos novedades para {{teamName}}.",
    );
    setKind((c?.audience.kind ?? "all") as keyof typeof audiences);
    setFieldId(c?.audience.fieldId ?? "");
    setEquals(String(c?.audience.equals ?? ""));
    setNotice("");
  }
  const preview = (value: string) =>
    value
      .replace(/{{\s*name\s*}}/g, "Alex")
      .replace(/{{\s*eventName\s*}}/g, event.name)
      .replace(/{{\s*teamName\s*}}/g, "Equipo Stellar");
  return (
    <>
      <div className="communication-columns">
        <aside className="profile-panel">
          <h3>{tr("Campañas")}</h3>
          <Button onClick={() => choose()}>{tr("Nueva campaña")}</Button>
          {campaigns?.map((c) => (
            <button
              className={`campaign-row ${c._id === selected ? "selected" : ""}`}
              key={c._id}
              onClick={() => choose(c)}
            >
              <strong>{c.subject}</strong>
              <span>
                {tr(statuses[c.status])} ·{" "}
                {c.category === "transactional"
                  ? tr("Automática")
                  : tr("{0} destinatarios", { "0": c.recipientCount ?? 0 })}
              </span>
            </button>
          ))}
        </aside>
        <form
          className="profile-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void perform(persist, "Borrador guardado.");
          }}
        >
          <h3>{current ? tr("Detalle de campaña") : tr("Crear campaña")}</h3>
          <label>
            {tr("Asunto")}
            <input
              required
              maxLength={200}
              disabled={!editable}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label>
            {tr("Audiencia")}
            <select
              disabled={!editable}
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              {Object.entries(audiences).map(([k, label]) => (
                <option key={k} value={k}>
                  {tr(String(label))}
                </option>
              ))}
            </select>
          </label>
          {kind === "filtered" && (
            <>
              <label>
                {tr("ID del campo")}
                <input
                  disabled={!editable}
                  value={fieldId}
                  onChange={(e) => setFieldId(e.target.value)}
                />
              </label>
              <label>
                {tr("Respuesta exacta")}
                <input
                  disabled={!editable}
                  value={equals}
                  onChange={(e) => setEquals(e.target.value)}
                />
              </label>
              <p>
                {tr(
                  "Este filtro requiere permiso para ver participantes y respeta la visibilidad del campo.",
                )}
              </p>
            </>
          )}
          <label>
            {tr("Mensaje en Markdown")}
            <textarea
              required
              rows={8}
              maxLength={20000}
              disabled={!editable}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <p>
            {tr("Hasta 5.000 destinatarios por campaña. Variables: ")}
            {tr("{{name}}, {{eventName}}, {{teamName}}")}.
          </p>
          <details open>
            <summary>{tr("Vista previa con datos de ejemplo")}</summary>
            <div
              className="email-preview"
              style={{ borderTopColor: event.theme.colors.primary }}
            >
              <small>{event.name}</small>
              <h3>{preview(subject)}</h3>
              <ReactMarkdown>{preview(body)}</ReactMarkdown>
              <small>
                {tr(
                  "Incluye enlace para dejar de recibir anuncios de este evento.",
                )}
              </small>
            </div>
          </details>
          {editable && (
            <>
              <Button disabled={busy} type="submit">
                {tr("Guardar borrador")}
              </Button>
              <Button
                disabled={busy || event.status !== "published"}
                type="button"
                className="manage-outline"
                onClick={() =>
                  void perform(
                    async () =>
                      test({ eventId: event._id, id: await persist() }),
                    "Prueba encolada para tu correo verificado.",
                  )
                }
              >
                {tr("Enviarme una prueba")}
              </Button>
              <label>
                {tr("Programar para (hora local, opcional)")}
                <input
                  type="datetime-local"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                />
              </label>
              <Button
                disabled={busy || event.status !== "published"}
                type="button"
                onClick={() =>
                  void perform(
                    async () =>
                      send({
                        eventId: event._id,
                        id: await persist(),
                        ...(schedule
                          ? { scheduledAt: new Date(schedule).getTime() }
                          : {}),
                      }),
                    schedule ? "Campaña programada." : "Envío iniciado.",
                  )
                }
              >
                {schedule ? tr("Programar campaña") : tr("Enviar campaña")}
              </Button>
            </>
          )}
          {current &&
            ["preparing", "scheduled", "sending"].includes(current.status) && (
              <Button
                type="button"
                className="manage-outline"
                disabled={busy}
                onClick={() =>
                  void perform(
                    () => cancel({ eventId: event._id, id: current._id }),
                    "Campaña cancelada. Los correos ya encolados pueden entregarse.",
                  )
                }
              >
                {tr("Cancelar campaña")}
              </Button>
            )}
          {current?.audienceFrozen &&
            ["sent", "failed"].includes(current.status) && (
              <Button
                type="button"
                disabled={busy}
                className="manage-outline"
                onClick={() =>
                  void perform(
                    () => retry({ eventId: event._id, id: current._id }),
                    "Reintentando los correos pendientes o bloqueados por cuota.",
                  )
                }
              >
                {tr("Reintentar pendientes por cuota")}
              </Button>
            )}
          {current?.error && <p role="alert">{tr(current.error)}</p>}
          <p role="status">{tr(notice)}</p>
        </form>
      </div>
      {selected && <RecipientList eventId={event._id} id={selected} />}
    </>
  );
}
function RecipientList({
  eventId,
  id,
}: {
  eventId: Id<"events">;
  id: Id<"emailCampaigns">;
}) {
  const { t: tr } = useI18n();

  const data = usePaginatedQuery(
    api.communication.recipients,
    { eventId, id },
    { initialNumItems: 20 },
  );
  return (
    <div className="profile-panel">
      <h3>{tr("Estado por destinatario")}</h3>
      <p>
        {tr(
          "“Procesada” significa que terminó la cola de la campaña. La entrega se confirma aquí mediante Resend.",
        )}
      </p>
      <div className="recipient-list">
        {data.results.map((r) => (
          <div key={r._id}>
            <strong>
              {r.name ?? tr("builder")}
              {r.isTest ? tr(" · prueba") : ""}
            </strong>
            <span>{r.email}</span>
            <span>
              {r.status === "sent"
                ? tr("Enviado")
                : tr(statuses[r.status] ?? r.status)}
              {r.error === "MONTHLY_QUOTA_EXCEEDED"
                ? tr(" · cuota mensual agotada")
                : ""}
            </span>
          </div>
        ))}
      </div>
      {data.status === "CanLoadMore" && (
        <Button onClick={() => data.loadMore(20)}>
          {tr("Ver más destinatarios")}
        </Button>
      )}
    </div>
  );
}
function AnnouncementEditor({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();

  const rows = useQuery(api.announcements.manage, { eventId }),
    post = useMutation(api.announcements.post),
    remove = useMutation(api.announcements.remove);
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [audience, setAudience] = useState<
      "all" | "participants" | "approved" | "judges" | "mentors"
    >("all"),
    [pinned, setPinned] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <form
        className="profile-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await post({ eventId, title, body, audience, pinned });
            setTitle("");
            setBody("");
            setNotice("Anuncio publicado.");
          } catch (err) {
            setNotice(
              err instanceof Error ? err.message : "No se pudo publicar.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>{tr("Publicar anuncio")}</h3>
        <label>
          {tr("Título del anuncio")}
          <input
            required
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          {tr("Contenido del anuncio")}
          <textarea
            required
            rows={5}
            maxLength={20000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <label>
          {tr("Visible para")}
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as typeof audience)}
          >
            <option value="all">{tr("Público")}</option>
            <option value="participants">{tr("Inscritos")}</option>
            <option value="approved">{tr("Aprobados")}</option>
            <option value="judges">{tr("Jurado")}</option>
            <option value="mentors">{tr("Mentores")}</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
          />{" "}
          {tr("Fijar anuncio")}
        </label>
        <Button disabled={busy}>{tr("Publicar anuncio")}</Button>
        <p role="status">{tr(notice)}</p>
      </form>
      {rows?.map((n) => (
        <article className="profile-panel" key={n._id}>
          <small>
            {n.pinned ? tr("Fijado · ") : ""}
            {n.audience}
          </small>
          <h3>{n.title}</h3>
          <ReactMarkdown>{n.body}</ReactMarkdown>
          <Button
            className="manage-outline"
            onClick={() =>
              void remove({ eventId, id: n._id }).catch((e) =>
                setNotice(e.message),
              )
            }
          >
            {tr("Eliminar anuncio")}
          </Button>
        </article>
      ))}
    </>
  );
}

function QuotaEditor({
  eventId,
  current,
}: {
  eventId: Id<"events">;
  current: number;
}) {
  const { t: tr } = useI18n();

  const setQuota = useMutation(api.communication.setQuota),
    [limit, setLimit] = useState(current),
    [message, setMessage] = useState("");
  return (
    <form
      className="profile-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await setQuota({ eventId, limit });
          setMessage("Cuota actualizada conservando el consumo de este mes.");
        } catch {
          setMessage("No se pudo actualizar la cuota.");
        }
      }}
    >
      <label>
        {tr("Cuota mensual del evento (superadmin)")}
        <input
          type="number"
          min={1}
          max={100000}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
      </label>
      <Button>{tr("Actualizar cuota")}</Button>
      <p role="status">{tr(message)}</p>
    </form>
  );
}
