import { useI18n, formatLocale } from "../../i18n/I18n";
import {
  EventAnnouncements,
  EmailPreferences,
} from "../communication/EventCommunication";
import { PublishedResults } from "../judging/PublishedResults";
import { BuildWorkspace } from "../projects/TeamHub";
import { PersonalCardStudio } from "../cards/PersonalCardStudio";
import { EventMcpAccess } from "./EventMcpAccess";
import { eventPath } from "../../lib/eventUrls";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useAction, useConvexAuth } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Answers } from "../../../convex/lib/formEngine";
import { Button } from "../../components/ui/button";
import { FormFields } from "./FormFields";
import {
  Responses,
  STATUS,
  useRegistrationOperation,
  type Registration,
} from "./shared";
type Me = FunctionReturnType<typeof api.users.me>;
function Gate({
  onConnect,
  children,
}: {
  onConnect: () => void;
  children: (me: Me) => ReactNode;
}) {
  const { t: tr } = useI18n();

  const { isAuthenticated, isLoading } = useConvexAuth(),
    me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  if (isLoading || (isAuthenticated && !me))
    return (
      <section className="simple-page">{tr("Cargando tu sesión…")}</section>
    );
  if (!me)
    return (
      <section className="simple-page">
        <h1>{tr("Tu próximo reto empieza aquí.")}</h1>
        <p>
          {tr(
            "Conecta tu wallet Stellar para inscribirte y consultar tu Hacker Pass.",
          )}
        </p>
        <Button onClick={onConnect}>{tr("Conectar wallet")}</Button>
      </section>
    );
  return children(me);
}
export function RegistrationPage({
  onConnect,
  eventSlug,
}: {
  onConnect: () => void;
  eventSlug?: string;
}) {
  const { t: tr } = useI18n();

  if (!import.meta.env.VITE_CONVEX_URL)
    return (
      <section className="simple-page">
        {tr("El registro no está disponible.")}
      </section>
    );
  return (
    <Gate onConnect={onConnect}>
      {(me) => <RegistrationEditor me={me} eventSlug={eventSlug} />}
    </Gate>
  );
}
export function ParticipantDashboardPage({
  onConnect,
  eventSlug,
}: {
  onConnect: () => void;
  eventSlug?: string;
}) {
  const { t: tr } = useI18n();

  if (!import.meta.env.VITE_CONVEX_URL)
    return (
      <section className="simple-page">
        {tr("El panel no está disponible.")}
      </section>
    );
  return (
    <Gate onConnect={onConnect}>
      {() => <Dashboard eventSlug={eventSlug} />}
    </Gate>
  );
}
function RegistrationEditor({ me, eventSlug }: { me: Me; eventSlug?: string }) {
  const { t: tr } = useI18n();

  const { slug: routeSlug = "" } = useParams(),
    slug = eventSlug ?? routeSlug,
    data = useQuery(api.forms.registration, { slug }),
    mine = useQuery(api.registrations.mine, { slug });
  if (data === undefined || mine === undefined)
    return (
      <section className="simple-page">{tr("Cargando inscripción…")}</section>
    );
  if (!data)
    return (
      <section className="simple-page">
        <h1>{tr("Evento no disponible.")}</h1>
        <Link to="/">{tr("Explorar eventos")}</Link>
      </section>
    );
  return (
    <section className="simple-page registration-page">
      <Link className="manage-back" to={eventPath(slug)}>
        ← {data.name}
      </Link>
      <div className="eyebrow">{tr("TU PRÓXIMO RETO")}</div>
      <h1>{tr("Inscríbete y construye.")}</h1>
      {mine ? (
        <div className="profile-panel">
          <h2>{tr(STATUS[mine.status])}</h2>
          <p>{tr("Ya tienes una inscripción en este evento.")}</p>
          <Button asChild>
            <Link to={eventPath(slug, "dashboard")}>
              {tr("Ver mi inscripción")}
            </Link>
          </Button>
        </div>
      ) : !me.name || !me.emailVerifiedAt ? (
        <div className="profile-panel">
          <h2>{tr("Completa tu perfil")}</h2>
          <p>
            {tr("Necesitas un nombre y un correo verificado para participar.")}
          </p>
          <Button asChild>
            <Link to="/perfil">{tr("Completar mi perfil")}</Link>
          </Button>
          <p>{tr("Después regresa a esta página para inscribirte.")}</p>
        </div>
      ) : !data.registrationOpen ? (
        <p>{tr("El registro está cerrado.")}</p>
      ) : !data.form ? (
        <p>
          {tr(
            "La organización todavía no ha publicado el formulario de registro.",
          )}
        </p>
      ) : (
        <RegistrationForm
          key={data.form._id}
          data={data as typeof data & { form: NonNullable<typeof data.form> }}
          me={me}
        />
      )}
    </section>
  );
}
function RegistrationForm({
  data,
  me,
}: {
  data: NonNullable<FunctionReturnType<typeof api.forms.registration>> & {
    form: NonNullable<
      NonNullable<FunctionReturnType<typeof api.forms.registration>>["form"]
    >;
  };
  me: Me;
}) {
  const { t: tr } = useI18n();

  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Answers>({}),
    [rules, setRules] = useState(false),
    [consent, setConsent] = useState(false),
    [optOut, setOptOut] = useState(false),
    submit = useMutation(api.registrations.submit),
    op = useRegistrationOperation(),
    navigate = useNavigate();
  return (
    <form
      className="profile-panel registration-form"
      onSubmit={(e) => {
        e.preventDefault();
        void op.run(async () => {
          await submit({
            eventId: data.eventId,
            formId: data.form._id,
            answers,
            rulesAccepted: rules,
            consentAccepted: consent,
            emailOptOut: optOut,
          });
          navigate(eventPath(data.slug, "dashboard"));
        });
      }}
    >
      <h2>{data.name}</h2>
      <div className="registration-fixed">
        <label>
          {tr("Nombre")}
          <input value={me.name ?? ""} readOnly />
        </label>
        <label>
          {tr("Correo verificado")}
          <input value={me.email ?? ""} readOnly />
        </label>
        <label>
          {tr("Wallet Stellar")}
          <input value={me.wallet} readOnly />
        </label>
        <Link to="/perfil">{tr("Actualizar mi perfil")}</Link>
      </div>
      <FormFields
        fields={data.form.fields}
        answers={answers}
        onChange={setAnswers}
        eventId={data.eventId}
        formId={data.form._id}
        onUploading={(id, busy) =>
          setUploading((old) => {
            const next = new Set(old);
            if (busy) next.add(id);
            else next.delete(id);
            return next;
          })
        }
      />
      <div className="consent-preview">
        <p>{data.form.rulesText}</p>
        <label className="checkbox-row">
          <input
            type="checkbox"
            required
            checked={rules}
            onChange={(e) => setRules(e.target.checked)}
          />
          {tr("Acepto las reglas del evento")}
        </label>
        <p>{data.form.consentText}</p>
        <label className="checkbox-row">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          {tr("Acepto el tratamiento de mis datos personales")}
        </label>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={optOut}
          onChange={(e) => setOptOut(e.target.checked)}
        />
        {tr(
          "No quiero recibir comunicaciones opcionales. Los avisos de mi inscripción seguirán activos.",
        )}
      </label>
      <p className="manage-caption">
        {tr("Formulario versión ")}
        {data.form.version}
        {tr(
          ". Tu perfil y las condiciones aceptadas se guardan con tu inscripción.",
        )}
      </p>
      <Button type="submit" disabled={op.busy || uploading.size > 0}>
        {op.busy ? tr("Enviando…") : tr("Enviar inscripción")}
      </Button>
      {op.message && <p role="status">{tr(op.message)}</p>}
    </form>
  );
}
function Dashboard({ eventSlug }: { eventSlug?: string }) {
  const { t: tr } = useI18n();

  const { slug: routeSlug = "" } = useParams(),
    slug = eventSlug ?? routeSlug,
    r = useQuery(api.registrations.mine, { slug }),
    notifications = useQuery(api.registrations.notifications, { slug }),
    withdraw = useMutation(api.registrations.withdraw),
    op = useRegistrationOperation(),
    [confirm, setConfirm] = useState(false),
    [tab, setTab] = useState("overview");
  if (r === undefined)
    return (
      <section className="simple-page">{tr("Cargando inscripción…")}</section>
    );
  if (!r)
    return (
      <section className="simple-page registration-page">
        <h1>{tr("Aún no tienes una inscripción.")}</h1>
        <Button asChild>
          <Link to={eventPath(slug, "register")}>{tr("Inscribirme")}</Link>
        </Button>
        <EventMcpAccess slug={slug} />
        <PersonalCardStudio slug={slug} />
      </section>
    );
  return (
    <section className="simple-page registration-page">
      <Link className="manage-back" to={eventPath(slug)}>
        {tr("← Volver al evento")}
      </Link>
      <div className="eyebrow">{tr("TU ESPACIO DE BUILDER")}</div>
      <h1>{tr("Tu inscripción.")}</h1>
      <nav
        className="manage-tabs manage-dashboard-tabs"
        aria-label={tr("Secciones del panel")}
      >
        {[
          ["overview", "Resumen"],
          ["build", "Equipo y proyecto"],
          ["cards", "Cards y credencial"],
          ["results", "Resultados"],
          ["preferences", "Preferencias"],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {tr(label)}
          </button>
        ))}
      </nav>
      {tab === "overview" ? (
        <>
          <EventAnnouncements slug={slug} />
          <div className="profile-panel">
            <span
              className={`manage-badge registration-status status-${r.status}`}
            >
              {tr(STATUS[r.status])}
            </span>
            <h2>{r.name}</h2>
            <p>{r.email}</p>
            <p className="wallet-address">{r.wallet}</p>
            {r.status === "pending" && (
              <p>
                {tr(
                  "La organización revisará tu solicitud. Te avisaremos cuando cambie tu estado.",
                )}
              </p>
            )}
            {r.status === "waitlisted" && (
              <p>
                {tr(
                  "Estás en lista de espera. Te avisaremos cuando tu inscripción sea aprobada.",
                )}
              </p>
            )}
            <Responses registration={r} />
            <details>
              <summary>
                {tr("Condiciones aceptadas · versión ")}
                {r.formVersion}
              </summary>
              <p>{r.rulesText}</p>
              <p>{r.consentText}</p>
              <p>{new Date(r.consentAt).toLocaleString(formatLocale())}</p>
            </details>
            {!["withdrawn", "checked_in"].includes(r.status) && (
              <div className="withdraw-controls">
                {confirm ? (
                  <>
                    <p>
                      {tr(
                        "Retirarás tu inscripción y liberarás tu cupo. No podrás volver a inscribirte en este evento.",
                      )}
                    </p>
                    <Button
                      disabled={op.busy}
                      onClick={() =>
                        void op.run(async () => {
                          await withdraw({ id: r.id });
                          setConfirm(false);
                        }, "Inscripción retirada.")
                      }
                    >
                      {tr("Confirmar retiro")}
                    </Button>
                    <button onClick={() => setConfirm(false)}>
                      {tr("Cancelar")}
                    </button>
                  </>
                ) : (
                  <button
                    className="text-link"
                    onClick={() => setConfirm(true)}
                  >
                    {tr("Retirar mi inscripción")}
                  </button>
                )}
              </div>
            )}
            {op.message && <p role="status">{tr(op.message)}</p>}
          </div>
        </>
      ) : tab === "build" ? (
        ["approved", "checked_in"].includes(r.status) ? (
          <BuildWorkspace eventId={r.eventId} slug={slug} />
        ) : (
          <div className="profile-panel">
            <h2>{tr("Tu equipo y proyecto")}</h2>
            <p>
              {tr(
                "El espacio de construcción estará disponible cuando aprueben tu inscripción.",
              )}
            </p>
          </div>
        )
      ) : tab === "cards" ? (
        <>
          {["approved", "checked_in"].includes(r.status) && (
            <HackerPass key={r.status} slug={slug} registration={r} />
          )}
          <PersonalCardStudio slug={slug} />
        </>
      ) : tab === "results" ? (
        <PublishedResults key={slug} slug={slug} />
      ) : (
        <>
          <EventMcpAccess slug={slug} />
          <EmailPreferences eventId={r.eventId} />
          {!!notifications?.length && (
            <details className="profile-panel">
              <summary>
                {tr("Buzón local de desarrollo (")}
                {notifications.length})
              </summary>
              {notifications.map((n, i) => (
                <article key={i}>
                  <h3>{n.subject}</h3>
                  <p>{n.body}</p>
                </article>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
function HackerPass({
  slug,
  registration: r,
}: {
  slug: string;
  registration: Registration;
}) {
  const { t: tr } = useI18n();

  const issue = useAction(api.hackerPass.issue),
    [pass, setPass] =
      useState<FunctionReturnType<typeof api.hackerPass.issue>>(),
    [qr, setQr] = useState(""),
    op = useRegistrationOperation();
  return (
    <aside className="profile-panel hacker-pass">
      <div className="eyebrow">{tr("HACKER PASS")}</div>
      <h2>{tr("Tu entrada al evento.")}</h2>
      <p>{tr("Muestra este QR al staff para confirmar tu asistencia.")}</p>
      {qr && (
        <img
          src={qr}
          alt={tr("QR del Hacker Pass de {0}", { "0": r.name })}
          width={360}
          height={360}
        />
      )}
      <h3>{r.name}</h3>
      {pass && <p>{pass.eventName}</p>}
      <p className="wallet-address">
        {r.wallet.slice(0, 8)}…{r.wallet.slice(-8)}
      </p>
      {r.checkedInAt && (
        <p>
          {tr("Check-in confirmado el ")}
          {new Date(r.checkedInAt).toLocaleString(formatLocale())}
        </p>
      )}
      <Button
        disabled={op.busy}
        onClick={() =>
          void op.run(async () => {
            const data = await issue({ slug }),
              QRCode = await import("qrcode");
            setQr(
              await QRCode.toDataURL(data.token, {
                scale: 8,
                margin: 4,
                errorCorrectionLevel: "M",
              }),
            );
            setPass(data);
          }, "Pase preparado.")
        }
      >
        {op.busy
          ? tr("Preparando pase…")
          : pass
            ? tr("Actualizar Hacker Pass")
            : tr("Mostrar Hacker Pass")}
      </Button>
      {pass && (
        <>
          <small>
            {tr("Válido hasta ")}
            {new Date(pass.expiresAt).toLocaleString(formatLocale())}
            {tr(". El staff comprobará el estado actual de tu inscripción.")}
          </small>
          <details>
            <summary>{tr("Código alternativo para el staff")}</summary>
            <textarea
              aria-label={tr("Código del Hacker Pass")}
              readOnly
              value={pass.token}
              rows={4}
            />
            <button
              onClick={() =>
                void op.run(
                  () => navigator.clipboard.writeText(pass.token),
                  "Código copiado.",
                )
              }
            >
              {tr("Copiar código del pase")}
            </button>
          </details>
        </>
      )}
      {op.message && <p role="status">{tr(op.message)}</p>}
    </aside>
  );
}
