import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { useI18n, formatLocale } from "../../i18n/I18n";
import { Button } from "../../components/ui/button";
import { ContentNotice, useContentOperation } from "./DesignEditor";

function dateTime(timestamp: number) {
  return new Intl.DateTimeFormat(formatLocale(), {
    dateStyle: "medium", timeStyle: "short",
  }).format(timestamp);
}
function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
export function MentorshipManager({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();
  const mentors = useQuery(api.content.mentorsList, { eventId });
  const slots = useQuery(api.mentorship.eventSlots, { eventId });
  const bookings = useQuery(api.mentorship.eventSchedule, { eventId });
  const create = useMutation(api.mentorship.createSlot);
  const attendance = useMutation(api.mentorship.setAttendance);
  const cancelBooking = useMutation(api.mentorship.cancelByOrganizer);
  const op = useContentOperation();
  const [mentorId, setMentorId] = useState<Id<"mentors"> | "">("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState(1);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [, refresh] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => refresh((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="mentorship-manager">
      <form className="profile-panel" onSubmit={(event) => {
        event.preventDefault();
        if (!mentorId || !startsAt || !endsAt) return;
        void op.run(async () => {
          await create({ eventId, mentorId, startsAt: new Date(startsAt).getTime(),
            endsAt: new Date(endsAt).getTime(), capacity, meetingUrl: meetingUrl.trim() || undefined });
          setStartsAt(""); setEndsAt(""); setMeetingUrl(""); setCapacity(1);
        }, "Horario de mentoría publicado.");
      }}>
        <h2>{tr("Disponibilidad para mentorías")}</h2>
        <p>{tr("Cada reserva corresponde a un equipo completo. Las horas se mostrarán en la zona local de cada persona.")} ({localTimeZone()})</p>
        <div className="manage-fields">
          <label>{tr("Mentor")}
            <select required value={mentorId} onChange={(e) => setMentorId(e.target.value as Id<"mentors"> | "")}>
              <option value="">{tr("Selecciona un mentor")}</option>
              {mentors?.map((mentor) => <option key={mentor._id} value={mentor._id}>{mentor.name}</option>)}
            </select>
          </label>
          <label>{tr("Inicio · hora local")}
            <input required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label>{tr("Fin · hora local")}
            <input required type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <label>{tr("Equipos por horario")}
            <input required type="number" min={1} max={50} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          </label>
          <label>{tr("Enlace externo de reunión (opcional)")}
            <input type="url" placeholder="https://meet.google.com/..." value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} />
          </label>
        </div>
        <Button disabled={op.busy || !mentors?.length}>{tr("Publicar horario")}</Button>
        {!mentors?.length && <p>{tr("Añade primero al menos un mentor al evento.")}</p>}
        <ContentNotice message={op.message} />
      </form>

      <section className="profile-panel">
        <h2>{tr("Horarios publicados")}</h2>
        {slots?.map((slot) => <article className="content-list-item" key={slot.id}>
          <h3>{slot.mentorName}</h3>
          <p>{dateTime(slot.startsAt)} – {dateTime(slot.endsAt)}</p>
          <p>{slot.booked}/{slot.capacity} {tr("equipos reservados")}</p>
          {slot.meetingUrl && <a href={slot.meetingUrl} target="_blank" rel="noreferrer">{tr("Abrir enlace de reunión")}</a>}
        </article>)}
        {slots?.length === 0 && <p>{tr("Todavía no hay horarios publicados.")}</p>}
      </section>

      <section className="profile-panel">
        <h2>{tr("Reservas y asistencia")}</h2>
        {bookings?.map((booking) => <article className="content-list-item" key={booking.id}>
          <h3>{booking.teamName} · {booking.mentorName}</h3>
          <p>{dateTime(booking.startsAt)} – {dateTime(booking.endsAt)}</p>
          <p>{tr(({ booked: "Reservada", cancelled: "Cancelada", no_show: "Ausencia", completed: "Realizada" } as const)[booking.status])}</p>
          {booking.cancellationReason && <p>{tr("Motivo")}: {booking.cancellationReason}</p>}
          {booking.meetingUrl && <a href={booking.meetingUrl} target="_blank" rel="noreferrer">{tr("Abrir enlace de reunión")}</a>}
          {booking.status === "booked" && booking.startsAt > Date.now() && <Button className="manage-outline" disabled={op.busy}
            onClick={() => void op.run(() => cancelBooking({ eventId, bookingId: booking.id, reason: "Cancelada por la organización." }), "Reserva cancelada por la organización.")}>{tr("Cancelar reserva")}</Button>}
          {booking.status === "booked" && booking.endsAt <= Date.now() && <div className="manage-actions">
            <Button disabled={op.busy} onClick={() => void op.run(() => attendance({ eventId, bookingId: booking.id, status: "completed" }), "Asistencia marcada como realizada.")}>{tr("Marcar realizada")}</Button>
            <Button className="manage-outline" disabled={op.busy} onClick={() => void op.run(() => attendance({ eventId, bookingId: booking.id, status: "no_show" }), "Ausencia registrada.")}>{tr("Registrar ausencia")}</Button>
          </div>}
        </article>)}
        {bookings?.length === 0 && <p>{tr("Aún no hay reservas.")}</p>}
        <ContentNotice message={op.message} />
      </section>
    </div>
  );
}

export function TeamMentorship({ teamId }: { teamId: Id<"teams"> }) {
  const { t: tr } = useI18n();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const data = useQuery(api.mentorship.teamSchedule, { teamId, from: now });
  const book = useMutation(api.mentorship.book);
  const cancel = useMutation(api.mentorship.cancel);
  const op = useContentOperation();
  if (!data) return <p>{tr("Cargando mentorías…")}</p>;
  return (
    <div className="mentorship-manager">
      <section className="profile-panel">
        <h2>{tr("Horarios disponibles para tu equipo")}</h2>
        <p>{tr("Una sola reserva cuenta para todo el equipo, sin importar cuántas personas lo integran.")} · {tr("Hora local")}: {localTimeZone()}</p>
        {data.slots.map((slot) => <article className="content-list-item" key={slot.id}>
          <h3>{slot.mentorName}</h3>
          <p>{slot.expertise.join(" · ")}</p>
          <p>{dateTime(slot.startsAt)} – {dateTime(slot.endsAt)}</p>
          <p>{Math.max(0, slot.capacity - slot.booked)} {tr("cupos para equipos disponibles")}</p>
          <Button disabled={op.busy || slot.booked >= slot.capacity || data.bookings.some((booking) => booking.slotId === slot.id && booking.status === "booked")}
            onClick={() => void op.run(() => book({ teamId, slotId: slot.id }), "Mentoría reservada para tu equipo.")}>{tr("Reservar para mi equipo")}</Button>
        </article>)}
        {data.slots.length === 0 && <p>{tr("No hay horarios futuros disponibles por ahora.")}</p>}
      </section>
      <section className="profile-panel">
        <h2>{tr("Historial de mentorías del equipo")}</h2>
        {data.bookings.map((booking) => <article className="content-list-item" key={booking.id}>
          <h3>{booking.mentorName}</h3>
          <p>{dateTime(booking.startsAt)} – {dateTime(booking.endsAt)}</p>
          <p>{tr(({ booked: "Reservada", cancelled: "Cancelada", no_show: "Ausencia", completed: "Realizada" } as const)[booking.status])}</p>
          {booking.cancellationReason && <p>{tr("Motivo")}: {booking.cancellationReason}</p>}
          {booking.meetingUrl && booking.status === "booked" && <a href={booking.meetingUrl} target="_blank" rel="noreferrer">{tr("Unirse a la reunión")}</a>}
          {booking.status === "booked" && booking.startsAt > Date.now() && <Button className="manage-outline" disabled={op.busy}
            onClick={() => void op.run(() => cancel({ bookingId: booking.id, reason: "Cancelada por el equipo." }), "Reserva cancelada; el cupo vuelve a estar disponible.")}>{tr("Cancelar reserva")}</Button>}
        </article>)}
        {data.bookings.length === 0 && <p>{tr("Tu equipo todavía no tiene reservas.")}</p>}
        <ContentNotice message={op.message} />
      </section>
    </div>
  );
}
