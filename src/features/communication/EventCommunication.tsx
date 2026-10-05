import { useI18n } from "../../i18n/I18n";
import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "../../components/ui/button";
export function EventAnnouncements({ slug }: { slug: string }) {
  const { t: tr } = useI18n();

  const rows = useQuery(api.announcements.list, { slug });
  if (!rows?.length) return null;
  return (
    <section className="event-announcements">
      <h2>{tr("Anuncios del evento")}</h2>
        {rows.map((n) => (
          <article className="profile-panel" key={n.id}>
          <small>{n.pinned ? tr("📌 Fijado") : tr("Novedades")}</small>
          <h3>{n.title}</h3>
          <ReactMarkdown>{n.body}</ReactMarkdown>
        </article>
      ))}
    </section>
  );
}
export function EmailPreferences({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();

  const optedOut = useQuery(api.communication.preference, { eventId }),
    set = useMutation(api.communication.setPreference).withOptimisticUpdate(
      (store, args) => {
        store.setQuery(
          api.communication.preference,
          { eventId: args.eventId },
          args.optedOut,
        );
      },
    ),
    mail = useQuery(api.communication.mailbox, { eventId });
  const [notice, setNotice] = useState("");
  return (
    <div className="profile-panel">
      <h3>{tr("Preferencias de comunicación")}</h3>
      <label>
        <input
          type="checkbox"
          checked={optedOut === false}
          disabled={optedOut === undefined}
          onChange={(e) =>
            void set({ eventId, optedOut: !e.target.checked })
              .then(() => setNotice("Preferencia guardada."))
              .catch(() => setNotice("No se pudo guardar."))
          }
        />{" "}
        {tr("Recibir anuncios de este evento por correo")}
      </label>
      <p>
        {tr(
          "Seguirás recibiendo los mensajes de inscripción, invitaciones y resultados.",
        )}
      </p>
      <p role="status">{tr(notice)}</p>
      {!!mail?.length && (
        <details>
          <summary>
            {tr("Correos del buzón local (")}
            {mail.length})
          </summary>
          {mail.map((m, i) => (
            <article key={i}>
              <h4>{m.subject}</h4>
              <ReactMarkdown>{m.body}</ReactMarkdown>
            </article>
          ))}
        </details>
      )}
    </div>
  );
}
export function UnsubscribePage() {
  const { t: tr } = useI18n();

  const { token = "" } = useParams(),
    unsubscribe = useAction(api.emailUnsubscribe.unsubscribe);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  return (
    <section className="simple-page">
      <h1>{tr("Preferencias de correo")}</h1>
      <p>
        {tr(
          "Confirma que deseas dejar de recibir anuncios de este evento. Los correos transaccionales seguirán activos.",
        )}
      </p>
      <Button
        disabled={busy || done}
        onClick={async () => {
          setBusy(true);
          try {
            await unsubscribe({ token });
            setDone(true);
            setMessage(
              "Baja confirmada. Puedes volver a suscribirte desde tu panel del evento.",
            );
          } catch {
            setMessage("El enlace no es válido o el evento ya no existe.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {tr("Confirmar baja")}
      </Button>
      <p role="status">{tr(message)}</p>
    </section>
  );
}
